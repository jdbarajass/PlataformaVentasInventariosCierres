'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, Phone, MapPin, Clock, Send, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import type { ContactInfo } from '@/lib/settings'
import { BRAND } from '@/config/brand'

const contactSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  subject: z.string().min(5, 'El asunto debe tener al menos 5 caracteres'),
  message: z.string().min(10, 'El mensaje debe tener al menos 10 caracteres'),
})

type ContactForm = z.infer<typeof contactSchema>

const DEFAULT_CONTACT: ContactInfo = {
  phone_primary: '+57 321 411 1371',
  phone_secondary: '+57 314 406 5520',
  email: 'yjbmotocom@gmail.com',
  address: 'Av Caracas No. 17-47 Local 111 Isla S, Cc Megacentro Puerta 2',
  city: 'Bogotá, Colombia',
  business_hours: {
    weekdays: 'Lunes a Viernes: 8:00 AM - 6:00 PM',
    saturday: 'Sábado: 9:00 AM - 2:00 PM',
    sunday: 'Domingo: Cerrado',
  },
}

export default function ContactoPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [contactInfo, setContactInfo] = useState<ContactInfo>(DEFAULT_CONTACT)
  const { toast } = useToast()

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then(({ data }) => {
        if (data?.contact_info) setContactInfo(data.contact_info)
      })
      .catch(() => {
        // Mantiene defaults si falla
      })
  }, [])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
  })

  const onSubmit = async (data: ContactForm) => {
    setIsSubmitting(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      toast({
        title: 'Mensaje enviado',
        description: 'Nos pondremos en contacto contigo pronto.',
      })
      reset()
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo enviar el mensaje. Intenta de nuevo.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4">
        {/* Hero Section */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold tracking-[0.12em] uppercase text-primary">
              Estamos para ayudarte
            </span>
          </div>
          <h1 className="mb-4 text-4xl font-black">Contáctanos</h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            ¿Tienes preguntas sobre nuestros productos? ¿Necesitas asesoría para
            elegir el mejor equipo para tu moto? Estamos aquí para ayudarte.
          </p>
        </div>

        <div className="grid gap-12 lg:grid-cols-2">
          {/* Contact Form */}
          <div className="rounded-2xl border border-border/50 bg-card p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold">Envíanos un mensaje</h2>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nombre *</label>
                  <Input
                    {...register('name')}
                    placeholder="Tu nombre"
                    className="rounded-xl"
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email *</label>
                  <Input
                    {...register('email')}
                    type="email"
                    placeholder="tu@email.com"
                    className="rounded-xl"
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Teléfono</label>
                  <Input
                    {...register('phone')}
                    placeholder="+57 321 411 1371"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Asunto *</label>
                  <Input
                    {...register('subject')}
                    placeholder="¿En qué podemos ayudarte?"
                    className="rounded-xl"
                  />
                  {errors.subject && (
                    <p className="text-sm text-destructive">{errors.subject.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Mensaje *</label>
                <textarea
                  {...register('message')}
                  rows={5}
                  placeholder="Cuéntanos más detalles..."
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {errors.message && (
                  <p className="text-sm text-destructive">{errors.message.message}</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isSubmitting ? (
                  'Enviando...'
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Enviar mensaje
                  </>
                )}
              </Button>
            </form>
          </div>

          {/* Contact Info + Map */}
          <div className="space-y-8">
            <div className="rounded-2xl border border-border/50 bg-card p-8">
              <h2 className="mb-6 text-2xl font-bold">Información de contacto</h2>
              <div className="space-y-6">
                {/* Teléfonos */}
                {(contactInfo.phone_primary || contactInfo.phone_secondary) && (
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                      <Phone className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Teléfono</h3>
                      {contactInfo.phone_primary && (
                        <a href={`tel:${contactInfo.phone_primary.replace(/\s/g,'')}`}
                           className="block text-muted-foreground hover:text-primary transition-colors">
                          {contactInfo.phone_primary}
                        </a>
                      )}
                      {contactInfo.phone_secondary && (
                        <a href={`tel:${contactInfo.phone_secondary.replace(/\s/g,'')}`}
                           className="block text-muted-foreground hover:text-primary transition-colors">
                          {contactInfo.phone_secondary}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Email */}
                {contactInfo.email && (
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                      <Mail className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Email</h3>
                      <a href={`mailto:${contactInfo.email}`}
                         className="text-muted-foreground hover:text-primary transition-colors">
                        {contactInfo.email}
                      </a>
                    </div>
                  </div>
                )}

                {/* Dirección */}
                {(contactInfo.address || contactInfo.city) && (
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                      <MapPin className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Dirección</h3>
                      {contactInfo.address && (
                        <p className="text-muted-foreground">{contactInfo.address}</p>
                      )}
                      {contactInfo.city && (
                        <p className="text-muted-foreground">{contactInfo.city}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Horarios */}
                {contactInfo.business_hours && (
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                      <Clock className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Horario de atención</h3>
                      {contactInfo.business_hours.weekdays && (
                        <p className="text-muted-foreground">
                          {contactInfo.business_hours.weekdays}
                        </p>
                      )}
                      {contactInfo.business_hours.saturday && (
                        <p className="text-muted-foreground">
                          {contactInfo.business_hours.saturday}
                        </p>
                      )}
                      {contactInfo.business_hours.sunday &&
                        contactInfo.business_hours.sunday !== 'Domingo: Cerrado' && (
                          <p className="text-muted-foreground">
                            {contactInfo.business_hours.sunday}
                          </p>
                        )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Google Maps embed */}
            <div className="overflow-hidden rounded-2xl border border-border/50">
              <iframe
                src="https://maps.google.com/maps?q=Av+Caracas+%2317-47,+Bogot%C3%A1,+Colombia&output=embed&hl=es&z=16"
                width="100%"
                height="280"
                style={{ border: 0, display: 'block' }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title={`Ubicación ${BRAND.name} - Av Caracas No. 17-47, Bogotá`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
