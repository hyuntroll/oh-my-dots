import { tokenCount } from '../lib/execution';

export default function RunUsage({ usage }: { usage: Record<string, unknown> }) {
  const input = tokenCount(usage.input_tokens), output = tokenCount(usage.output_tokens);
  const cached = Math.min(input, tokenCount(usage.cached_input_tokens));
  const requests = tokenCount(usage.model_requests);
  const latest = typeof usage.last_input_tokens === 'number' ? tokenCount(usage.last_input_tokens) : null;
  return <details className="run-usage">
    <summary>최근 작업 · 누적 입력 {input.toLocaleString()} · 출력 {output.toLocaleString()} 토큰{requests > 0 && ` · 모델 ${requests.toLocaleString()}회`}</summary>
    <div className="usage-breakdown">
      <dl><div><dt>입력 중 캐시</dt><dd>{cached.toLocaleString()}</dd></div><div><dt>입력 중 비캐시</dt><dd>{(input - cached).toLocaleString()}</dd></div>{latest !== null && <div><dt>마지막 요청 입력</dt><dd>{latest.toLocaleString()}</dd></div>}</dl>
      <p>입력은 작업 중 여러 모델 호출의 합계입니다. 캐시도 입력에 포함되며, 이 수치는 청구 금액이나 계정 잔여 한도가 아닙니다.</p>
    </div>
  </details>;
}
