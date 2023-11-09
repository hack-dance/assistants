import Link from "next/link"

export default async function Page() {
  return (
    <div className="flex justify-center items-center h-full flex-1 w-full flex-col">
      <div className="text-[80px] font-bold font-blunt">×</div>
      <div className="text-left space-y-3">
        <Link href="/assistants" className="text-sm font-medium leading-none block hover:underline">
          next-assistants
        </Link>
      </div>
    </div>
  )
}
