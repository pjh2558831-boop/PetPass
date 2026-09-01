"use client";

import { useState } from "react";
import { AppDialog } from "@/components/ui/app-dialog";

export function DeletePetForm({ action, petName }: { action: () => void | Promise<void>; petName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="account-destructive-zone mx-auto mt-6 flex max-w-2xl items-center justify-between gap-4">
      <div>
        <p className="text-sm font-black text-[#6e3f39]">반려동물 정보 삭제</p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">삭제한 정보와 사진은 복구할 수 없습니다.</p>
      </div>
      <button type="button" aria-label={`${petName} 정보 삭제`} onClick={() => setOpen(true)} className="min-h-11 shrink-0 rounded-lg border border-red-200 bg-white px-4 text-sm font-extrabold text-red-700">삭제</button>
      <AppDialog
        open={open}
        title={`${petName} 정보를 삭제할까요?`}
        description="삭제한 정보와 사진은 복구할 수 없습니다."
        onClose={() => setOpen(false)}
      >
        <form action={action} onSubmit={() => setOpen(false)}>
          <div className="app-confirm-dialog__actions">
            <button type="button" onClick={() => setOpen(false)}>취소</button>
            <button type="submit" className="is-warning">삭제</button>
          </div>
        </form>
      </AppDialog>
    </div>
  );
}
