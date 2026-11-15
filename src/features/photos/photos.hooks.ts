/**
 * React Query hooks for customer photos.
 * Bytes are captured locally first; sync uploads them when online.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CustomerPhotoRepository,
  type CreatePhotoInput,
} from '@database/repositories/customer-photo.repository'
import { useAuthStore } from '@state/auth.store'
import { getDatabase } from '@database/sqlite/database'
import { generateUUID } from '@shared/utils/helpers'
import { deletePhotoFile, savePhotoFile } from './photo-storage'
import type { CustomerPhoto } from '@shared/types'

export const photoKeys = {
  byCustomer: (userId: string, customerId: string) =>
    ['customer-photos', userId, 'customer', customerId] as const,
  byVisit: (userId: string, visitId: string) =>
    ['customer-photos', userId, 'visit', visitId] as const,
}

async function getRepo(userId: string) {
  const db = await getDatabase()
  return new CustomerPhotoRepository(db, userId)
}

export function useCustomerPhotos(customerId: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: photoKeys.byCustomer(userId, customerId),
    queryFn: async () => {
      const repo = await getRepo(userId)
      return repo.listByCustomer(customerId)
    },
    enabled: !!userId && !!customerId,
    staleTime: 1000 * 20,
  })
}

export interface AddPhotoInput {
  customerId: string
  visitId?: string | null
  dataUrl: string
  format: string
  photoType?: CreatePhotoInput['photo_type']
  caption?: string | null
  consentGiven: boolean
}

export function useAddPhoto() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async (input: AddPhotoInput) => {
      const repo = await getRepo(userId)
      const saved = await savePhotoFile(input.dataUrl, userId, generateUUID(), input.format)

      try {
        return await repo.create({
          customer_id: input.customerId,
          visit_id: input.visitId ?? null,
          local_path: saved,
          photo_type: input.photoType,
          caption: input.caption,
          consent_given: input.consentGiven,
        })
      } catch (err) {
        await deletePhotoFile(saved)
        throw err
      }
    },
    onSuccess: photo => {
      const key = photoKeys.byCustomer(userId, photo.customer_id ?? '')
      qc.setQueryData<CustomerPhoto[]>(key, old => (old ? [photo, ...old] : [photo]))
      void qc.invalidateQueries({ queryKey: key })
    },
  })
}

export function useDeletePhoto(customerId: string) {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async (id: string) => {
      const repo = await getRepo(userId)
      const localPath = await repo.delete(id)
      if (localPath) await deletePhotoFile(localPath)
      return id
    },
    onSuccess: id => {
      qc.setQueryData<CustomerPhoto[]>(photoKeys.byCustomer(userId, customerId), old =>
        old ? old.filter(photo => photo.id !== id) : []
      )
      void qc.invalidateQueries({ queryKey: photoKeys.byCustomer(userId, customerId) })
    },
  })
}
