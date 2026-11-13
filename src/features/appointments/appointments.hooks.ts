import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AppointmentConflictError,
  AppointmentRepository,
  type CreateAppointmentInput,
  type UpdateAppointmentInput,
} from '@database/repositories/appointment.repository'
import { useAuthStore } from '@state/auth.store'
import { getDatabase } from '@database/sqlite/database'
import {
  scheduleAppointmentReminder,
  cancelAppointmentReminder,
} from '@services/notifications/local-notifications'
import type { AppointmentStatus } from '@shared/types'
import { localDateISO } from '@shared/utils/datetime'

export const appointmentKeys = {
  day: (uid: string, date: string) => ['appointments', uid, 'day', date] as const,
  week: (uid: string, date: string) => ['appointments', uid, 'week', date] as const,
  detail: (uid: string, id: string) => ['appointments', uid, id] as const,
  next: (uid: string) => ['appointments', uid, 'next'] as const,
  services: (uid: string, apptId: string) => ['appointment-services', uid, apptId] as const,
}

async function getRepo(userId: string) {
  const db = await getDatabase()
  return new AppointmentRepository(db, userId)
}

function rethrowConflict(err: unknown): never {
  if (err instanceof AppointmentConflictError) {
    throw new Error(`تداخل با نوبت «${err.conflictingTitle}» در همین ساعت`)
  }
  throw err
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useAppointmentsByDay(dateISO: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: appointmentKeys.day(userId, dateISO),
    queryFn: async () => {
      const repo = await getRepo(userId)
      return repo.findByDay(dateISO)
    },
    enabled: !!userId && !!dateISO,
    staleTime: 1000 * 20,
  })
}

export function useAppointmentsByWeek(mondayISO: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: appointmentKeys.week(userId, mondayISO),
    queryFn: async () => {
      const repo = await getRepo(userId)
      return repo.findByWeek(mondayISO)
    },
    enabled: !!userId && !!mondayISO,
    staleTime: 1000 * 20,
  })
}

export function useAppointment(id: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: appointmentKeys.detail(userId, id),
    queryFn: async () => {
      const repo = await getRepo(userId)
      return repo.findById(id)
    },
    enabled: !!userId && !!id,
  })
}

export function useAppointmentServices(appointmentId: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: appointmentKeys.services(userId, appointmentId),
    queryFn: async () => {
      const repo = await getRepo(userId)
      return repo.findServicesForAppointment(appointmentId)
    },
    enabled: !!userId && !!appointmentId,
  })
}

export function useNextAppointment() {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: appointmentKeys.next(userId),
    queryFn: async () => {
      const repo = await getRepo(userId)
      return repo.findNext()
    },
    enabled: !!userId,
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60 * 5, // refresh every 5 min
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateAppointment() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async (input: CreateAppointmentInput) => {
      const repo = await getRepo(userId)
      try {
        const appt = await repo.create(input)
        await scheduleAppointmentReminder(appt)
        return appt
      } catch (err) {
        rethrowConflict(err)
      }
    },
    onSuccess: appt => {
      const dateISO = localDateISO(appt.start_at)
      void qc.invalidateQueries({ queryKey: appointmentKeys.day(userId, dateISO) })
      void qc.invalidateQueries({ queryKey: appointmentKeys.next(userId) })
    },
  })
}

export function useUpdateAppointmentStatus() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AppointmentStatus }) => {
      const repo = await getRepo(userId)
      await repo.updateStatus(id, status)
      if (status !== 'reserved' && status !== 'confirmed') {
        await cancelAppointmentReminder(id)
      }
      return { id, status }
    },
    onSuccess: ({ id }) => {
      void qc.invalidateQueries({ queryKey: appointmentKeys.detail(userId, id) })
      void qc.invalidateQueries({ queryKey: ['appointments', userId] })
    },
  })
}

export function useUpdateAppointment() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateAppointmentInput }) => {
      const repo = await getRepo(userId)
      try {
        return await repo.update(id, input)
      } catch (err) {
        rethrowConflict(err)
      }
    },
    onSuccess: async updated => {
      if (!updated) return
      if (updated.status !== 'reserved' && updated.status !== 'confirmed') {
        await cancelAppointmentReminder(updated.id)
      } else {
        // Scheduling with the same notification id replaces the old reminder.
        await scheduleAppointmentReminder(updated)
      }
      void qc.invalidateQueries({ queryKey: appointmentKeys.detail(userId, updated.id) })
      void qc.invalidateQueries({ queryKey: appointmentKeys.services(userId, updated.id) })
      void qc.invalidateQueries({ queryKey: ['appointments', userId] })
    },
  })
}

export function useDeleteAppointment() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async (id: string) => {
      const repo = await getRepo(userId)
      await repo.softDelete(id)
      await cancelAppointmentReminder(id)
      return id
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['appointments', userId] })
    },
  })
}
