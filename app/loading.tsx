export default function Loading() {
  return (
    <div className="page-shell py-12" role="status" aria-label="페이지 불러오는 중">
      <div className="animate-pulse">
        <div className="h-4 w-28 rounded-full bg-[#dce5df]" />
        <div className="mt-5 h-10 max-w-xl rounded-2xl bg-[#dce5df]" />
        <div className="mt-3 h-5 max-w-md rounded-2xl bg-[#e5ebe7]" />
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <div className="h-[380px] rounded-[28px] bg-[#dce9e3]" />
          <div className="space-y-4">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-36 rounded-3xl bg-[#fffdf8]" />
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">정보를 준비하고 있어요.</span>
    </div>
  );
}
