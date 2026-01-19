import { MainNav } from "./MainNav"

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        <div className="mr-8">
          <h1 className="text-xl font-bold">Expense Reporter</h1>
        </div>
        <MainNav />
      </div>
    </header>
  )
}