import { redirect } from 'next/navigation'

/** صفحة المدفوعات أُوقفت — السجل المالي في الحسابات البنكية */
export default function PaymentsPage() {
  redirect('/bank-accounts')
}
