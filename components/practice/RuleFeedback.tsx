export default function RuleFeedback({ message, tone = 'info' }: { message?: string; tone?: 'info' | 'success' | 'warning' }) {
  return message ? <p className={`rule-feedback ${tone}`} role="status">{message}</p> : null
}
