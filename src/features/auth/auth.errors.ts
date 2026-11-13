/**
 * Persian messages for Supabase Auth errors.
 * The raw provider message is logged, never shown to the user.
 */

export function mapAuthError(message: string): string {
  const lower = message.toLowerCase()
  console.error('[auth] provider error:', message)

  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
    return 'ایمیل یا رمز عبور اشتباه است'
  }
  if (lower.includes('email already registered') || lower.includes('already registered')) {
    return 'این ایمیل قبلاً ثبت شده است'
  }
  if (lower.includes('email not confirmed') || lower.includes('not confirmed')) {
    return 'ایمیل خود را تأیید کنید. لینک تأیید به ایمیل شما ارسال شده است'
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'تعداد درخواست‌ها زیاد است. کمی صبر کنید'
  }
  if (lower.includes('email link is invalid') || lower.includes('expired')) {
    return 'لینک بازیابی نامعتبر یا منقضی شده است. دوباره درخواست دهید'
  }
  if (lower.includes('weak password') || lower.includes('password should be')) {
    return 'رمز عبور ضعیف است؛ حداقل ۸ کاراکتر شامل حرف و عدد وارد کنید'
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timed out')) {
    return 'خطا در اتصال به سرور. اینترنت را بررسی کنید'
  }
  if (lower.includes('password')) {
    return 'رمز عبور معتبر نیست'
  }

  return 'خطایی رخ داد. دوباره تلاش کنید'
}
