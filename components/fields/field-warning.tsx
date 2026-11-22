/**
 * 입력란 아래 경고 문단(F-7 DoD-9·DoD-11·DoD-12). `⚠` 접두를 붙여 색만으로 구분하지 않는다.
 * 입력란은 경고가 있을 때만 이 `id`를 `aria-describedby`로 건다. 알림 방식이 정해지지 않아
 * `role`·`aria-live`는 붙이지 않는다.
 */
export function FieldWarning({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="text-sm text-destructive">
      {`⚠ ${children}`}
    </p>
  );
}
