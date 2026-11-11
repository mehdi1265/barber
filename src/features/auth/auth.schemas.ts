import { z } from 'zod'

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'ایمیل الزامی است')
    .email('ایمیل معتبر وارد کنید'),
  password: z
    .string()
    .min(6, 'رمز عبور حداقل ۶ کاراکتر باید باشد'),
})

export const registerSchema = z
  .object({
    display_name: z
      .string()
      .min(2, 'نام حداقل ۲ کاراکتر باید باشد')
      .max(60, 'نام حداکثر ۶۰ کاراکتر می‌تواند باشد'),
    email: z
      .string()
      .min(1, 'ایمیل الزامی است')
      .email('ایمیل معتبر وارد کنید'),
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
