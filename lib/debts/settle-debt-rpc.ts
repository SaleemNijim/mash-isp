export function isSettleDebtRpcMissing(message: string): boolean {
  return (
    message.includes('Could not find the function') ||
    message.includes('settle_customer_debt') ||
    message.includes('receive_distributor_payment')
  )
}

export const SETTLE_DEBT_RPC_HINT = 'يجب تطبيق migrations — شغّل: npm run db:push'
