import { redirect } from 'next/navigation'

/** إعادة توجيه — الصفحة الموحّدة أصبحت /customers */
export default function SubscriptionsPage() {
  redirect('/customers')
}
