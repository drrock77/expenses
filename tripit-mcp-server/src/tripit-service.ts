import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

export interface Trip {
    id: string;
    display_name: string;
    start_date: string;
    end_date: string;
    primary_location: string;
    is_past: boolean;
}

export interface TripDetails {
    id: string;
    display_name: string;
    start_date: string;
    end_date: string;
    primary_location: string;
    description?: string;
    flights: FlightSegment[];
    hotels: HotelReservation[];
    activities: Activity[];
}

export interface FlightSegment {
    id: string;
    confirmation_num?: string;
    airline: string;
    flight_number: string;
    departure_airport: string;
    arrival_airport: string;
    departure_time: string;
    arrival_time: string;
}

export interface HotelReservation {
    id: string;
    confirmation_num?: string;
    hotel_name: string;
    address?: string;
    check_in_date: string;
    check_out_date: string;
    room_type?: string;
}

export interface Activity {
    id: string;
    display_name: string;
    start_date: string;
    end_date?: string;
    address?: string;
}

export class TripItService {
    private oauth: OAuth;
    private accessToken: string;
    private accessTokenSecret: string;
    private consumerKey: string;
    private consumerSecret: string;

    constructor(config: {
        accessToken: string;
        accessTokenSecret: string;
        consumerKey: string;
        consumerSecret: string;
    }) {
        this.accessToken = config.accessToken;
        this.accessTokenSecret = config.accessTokenSecret;
        this.consumerKey = config.consumerKey;
        this.consumerSecret = config.consumerSecret;

        this.oauth = new OAuth({
            consumer: {
                key: this.consumerKey,
                secret: this.consumerSecret,
            },
            signature_method: 'HMAC-SHA1',
            hash_function(base_string, key) {
                return crypto
                    .createHmac('sha1', key)
                    .update(base_string)
                    .digest('base64');
            },
        });
    }

    private async makeRequest(url: string, method: string = 'GET'): Promise<any> {
        const request_data = { url, method };
        const token = {
            key: this.accessToken,
            secret: this.accessTokenSecret,
        };

        const authHeader = this.oauth.toHeader(this.oauth.authorize(request_data, token));

        const response = await fetch(url, {
            method,
            headers: { ...authHeader },
        });

        if (!response.ok) {
            throw new Error(`TripIt API error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    }

    async getTrips(includePast: boolean = true): Promise<Trip[]> {
        const fetchTrips = async (isPast: boolean) => {
            try {
                const url = `https://api.tripit.com/v1/list/trip/past/${isPast}/format/json`;
                const data = await this.makeRequest(url);
                const rawTrips = data.Trip || [];
                return Array.isArray(rawTrips) ? rawTrips : [rawTrips];
            } catch (error) {
                console.error(`Error fetching ${isPast ? 'past' : 'upcoming'} trips:`, error);
                return [];
            }
        };

        const tripLists = includePast
            ? await Promise.all([fetchTrips(true), fetchTrips(false)])
            : [[], await fetchTrips(false)];

        const [pastTrips, futureTrips] = tripLists;
        const allTrips = [...futureTrips, ...pastTrips];

        return allTrips.map((t: any) => ({
            id: t.id,
            display_name: t.display_name,
            start_date: t.start_date,
            end_date: t.end_date,
            primary_location: t.PrimaryLocationAddress?.city || t.PrimaryLocationAddress?.address || 'Unknown',
            is_past: new Date(t.end_date) < new Date(),
        })).sort((a: Trip, b: Trip) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
    }

    async getTripDetails(tripId: string): Promise<TripDetails> {
        const url = `https://api.tripit.com/v1/get/trip/id/${tripId}/include_objects/true/format/json`;
        const data = await this.makeRequest(url);

        const trip = data.Trip;
        if (!trip) {
            throw new Error(`Trip ${tripId} not found`);
        }

        const flights: FlightSegment[] = [];
        const airSegments = data.AirObject || [];
        const segments = Array.isArray(airSegments) ? airSegments : [airSegments];

        for (const air of segments) {
            if (air.Segment) {
                const segs = Array.isArray(air.Segment) ? air.Segment : [air.Segment];
                for (const seg of segs) {
                    flights.push({
                        id: seg.id || air.id,
                        confirmation_num: air.booking_confirmation_num,
                        airline: seg.marketing_airline || 'Unknown',
                        flight_number: seg.marketing_flight_number || '',
                        departure_airport: seg.start_airport_code || '',
                        arrival_airport: seg.end_airport_code || '',
                        departure_time: seg.StartDateTime?.date + ' ' + (seg.StartDateTime?.time || ''),
                        arrival_time: seg.EndDateTime?.date + ' ' + (seg.EndDateTime?.time || ''),
                    });
                }
            }
        }

        const hotels: HotelReservation[] = [];
        const hotelObjects = data.LodgingObject || [];
        const hotelList = Array.isArray(hotelObjects) ? hotelObjects : [hotelObjects];

        for (const hotel of hotelList) {
            hotels.push({
                id: hotel.id,
                confirmation_num: hotel.booking_confirmation_num,
                hotel_name: hotel.display_name || 'Unknown Hotel',
                address: hotel.Address?.address,
                check_in_date: hotel.StartDateTime?.date || '',
                check_out_date: hotel.EndDateTime?.date || '',
                room_type: hotel.room_type,
            });
        }

        const activities: Activity[] = [];
        const activityObjects = data.ActivityObject || [];
        const activityList = Array.isArray(activityObjects) ? activityObjects : [activityObjects];

        for (const act of activityList) {
            activities.push({
                id: act.id,
                display_name: act.display_name || 'Activity',
                start_date: act.StartDateTime?.date || '',
                end_date: act.EndDateTime?.date,
                address: act.Address?.address,
            });
        }

        return {
            id: trip.id,
            display_name: trip.display_name,
            start_date: trip.start_date,
            end_date: trip.end_date,
            primary_location: trip.PrimaryLocationAddress?.city || trip.PrimaryLocationAddress?.address || 'Unknown',
            description: trip.description,
            flights,
            hotels,
            activities,
        };
    }

    async getUpcomingTrips(): Promise<Trip[]> {
        return this.getTrips(false);
    }

    async getPastTrips(limit: number = 10): Promise<Trip[]> {
        const trips = await this.getTrips(true);
        return trips.filter(t => t.is_past).slice(0, limit);
    }
}
