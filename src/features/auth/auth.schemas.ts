import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().min(1, 'ایمیل الزامی است').email('ایمیل معتبر وارد کنید'),
  password: z.string().min(6, 'رمز عبور حداقل ۶ کاراکتر باید باشد'),
})

export const registerSchema = z
  .object({
    display_name: z
      .string()
      .min(2, 'نام حداقل ۲ کاراکتر باید باشد')
      .max(60, 'نام حداکثر ۶۰ کاراکتر می‌تواند باشد'),
    email: z.string().min(1, 'ایمیل الزامی است').email('ایمیل معتبر وارد کنید'),
    password: z
      .string()
      .min(8, 'رمز عبور حداقل ۸ کاراکتر باید باشد')
      .regex(/[A-Za-z]/, 'رمز عبور باید حداقل یک حرف داشته باشد')
      .regex(/[0-9]/, 'رمز عبور باید حداقل یک عدد داشته باشد'),
    confirmPassword: z.string().min(1, 'تکرار رمز عبور الزامی است'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'رمز عبور و تکرار آن یکسان نیستند',
    path: ['confirmPassword'],
  })

export type LoginFormData = z.infer<typeof loginSchema>
export type RegisterFormData = z.infer<typeof registerSchema>

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'ایمیل الزامی است').email('ایمیل معتبر وارد کنید'),
})

const strongPassword = z
  .string()
  .min(8, 'رمز عبور حداقل ۸ کاراکتر باید باشد')
  .regex(/[A-Za-z]/, 'رمز عبور باید حداقل یک حرف داشته باشد')
  .regex(/[0-9]/, 'رمز عبور باید حداقل یک عدد داشته باشد')

/** Supabase email OTPs are 6 digits by default and configurable up to 10. */
export const recoveryOtpSchema = z.object({
  email: z.string().min(1, 'ایمیل الزامی است').email('ایمیل معتبر وارد کنید'),
  token: z
    .string()
    .trim()
    .regex(/^\d{6,10}$/, 'کد بازیابی باید ۶ تا ۱۰ رقم باشد'),
})

export const resetPasswordSchema = z
  .object({
    password: strongPassword,
    confirmPassword: z.string().min(1, 'تکرار رمز عبور الزامی است'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'رمز عبور و تکرار آن یکسان نیستند',
    path: ['confirmPassword'],
  })

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>
export type RecoveryOtpFormData = z.infer<typeof recoveryOtpSchema>
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>
