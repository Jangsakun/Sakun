import Image from "next/image";

// 안내 페이지 공용 조각(당근 /guide, 고정 직원 /guide/staff)

export type Shot = { src: string; w: number; h: number; alt: string; crop?: boolean };

export function Phone({ shot, caption }: { shot: Shot; caption?: string }) {
  return (
    <figure className="mx-auto w-full max-w-[250px]">
      <div className="overflow-hidden rounded-[28px] border-[6px] border-gray-900 bg-gray-900 shadow-lg">
        <div className={shot.crop ? "relative aspect-[780/1000] overflow-hidden bg-[#f5f5f7]" : ""}>
          <Image
            src={shot.src}
            alt={shot.alt}
            width={shot.w}
            height={shot.h}
            sizes="250px"
            className={shot.crop ? "absolute inset-0 h-full w-full object-cover object-center" : "block h-auto w-full"}
          />
        </div>
      </div>
      {caption && <figcaption className="mt-2 text-center text-xs text-gray-500">{caption}</figcaption>}
    </figure>
  );
}

export function Step({ no, title, children }: { no: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white px-5 py-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500 text-base font-bold text-white">
          {no}
        </span>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      </div>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

export function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-gray-50 px-4 py-4">
      <p className="font-semibold text-gray-900">Q. {q}</p>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-700">{children}</div>
    </div>
  );
}
