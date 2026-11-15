import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ProfileRepository } from '@database/repositories/profile.repository'
import { getDatabase } from '@database/sqlite/database'
import { useAuthStore } from '@state/auth.store'
import type { Profile } from '@shared/types'
import type { ProfileFormData } from './settings.schemas'

export const profileKeys = {
  detail: (uid: string) => ['profile', uid] as const,
}

async function getRepo() {
  const db = await getDatabase()
  return new ProfileRepository(db)
}

export function useProfile() {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: profileKeys.detail(userId),
    queryFn: async () => {
      const repo = await getRepo()
      return repo.getProfile(userId)
    },
    enabled: !!userId,
    staleTime: 1000 * 60,
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async (input: ProfileFormData): Promise<Profile> => {
      const repo = await getRepo()
      const existing = await repo.getProfile(userId)

      if (existing) {
        await repo.updateProfile(userId, input)
        const updated = await repo.getProfile(userId)
        if (!updated) throw new Error('پروفایل ذخیره نشد')
        return updated
      }

      // Self-repair for a missing local row (for example after a manual wipe).
      return repo.createProfile({
        id: userId,
        user_id: userId,
        display_name: input.display_name,
        phone: input.phone,
        currency_code: input.currency_code,
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: profileKeys.detail(userId) })
    },
  })
}
