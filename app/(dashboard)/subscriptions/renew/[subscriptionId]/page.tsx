'use client'

import { useParams } from 'next/navigation'
import { SubscriptionPeriodForm } from '@/components/subscriptions/SubscriptionPeriodForm'

export default function RenewSubscriptionPage() {
  const params = useParams()
  const subscriptionId = params.subscriptionId as string

  return <SubscriptionPeriodForm mode="renew" subscriptionId={subscriptionId} />
}
