/**
 * Completing an appointment is also when its money becomes real: the visit and
 * its payment are written first, then the status flips. If the status update
 * fails, a retry finds the visit through the appointment id and only finishes
 * the status, so income is never recorded twice.
 */

import type { AppointmentRepository } from '@database/repositories/appointment.repository'
import type { VisitRepository } from '@database/repositories/visit.repository'
import { storageToToman } from '@shared/utils/helpers'
import type { UUID } from '@shared/types'

export interface CompletionDeps {
  appointments: AppointmentRepository
  visits: VisitRepository
}

export async function completeAppointment(
  { appointments, visits }: CompletionDeps,
  appointmentId: UUID
): Promise<void> {
  const appointment = await appointments.findById(appointmentId)
  if (!appointment) throw new Error('Appointment not found')

  const existing = await visits.findByAppointment(appointmentId)
  if (!existing) {
    const services = await appointments.findServicesForAppointment(appointmentId)
    if (services.length > 0) {
      const total = services.reduce((sum, svc) => sum + storageToToman(svc.price), 0)

      await visits.create({
        customer_id: appointment.customer_id,
        appointment_id: appointment.id,
        notes: `نوبت: ${appointment.title}`,
        services: services.map(svc => ({
          service_id: svc.service_id,
          service_name_snapshot: svc.service_name_snapshot,
          quantity: 1,
          unit_price: storageToToman(svc.price),
          duration_minutes: svc.duration_minutes,
        })),
        payment:
          total > 0 ? { amount: total, method: 'cash', note: 'دریافت هنگام تکمیل نوبت' } : null,
      })
    }
  }

  await appointments.updateStatus(appointmentId, 'completed')
}
