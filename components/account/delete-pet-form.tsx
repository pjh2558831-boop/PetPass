"use client";

export function DeletePetForm({ action, petName }: { action: () => void | Promise<void>; petName: string }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`${petName} 정보를 삭제할까요? 삭제한 정보와 사진은 복구할 수 없습니다.`)) {
          event.preventDefault();
        }
      }}
      className="mx-auto mt-4 flex max-w-2xl justify-end"
    >
      <button type="submit" className="min-h-11 rounded-xl border border-red-200 bg-white px-4 text-sm font-extrabold text-red-700">반려동물 삭제</button>
    </form>
  );
}
