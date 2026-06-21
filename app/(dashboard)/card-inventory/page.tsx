'use client'

import { PageHeader } from '@/components/shared/PageHeader'
import { CategoriesTab } from '@/components/cards/CategoriesTab'
import { BatchesTab } from '@/components/cards/BatchesTab'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function CardInventoryPage() {
  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader
        title="مخزون البطاقات"
        description="فئات البطاقات واستلام الدفعات — المخزون يُحدَّث تلقائياً عند الاستلام والبيع"
      />

      <Tabs defaultValue="categories" className="space-y-4">
        <TabsList>
          <TabsTrigger value="categories">الفئات</TabsTrigger>
          <TabsTrigger value="batches">الدفعات</TabsTrigger>
        </TabsList>
        <TabsContent value="categories">
          <CategoriesTab />
        </TabsContent>
        <TabsContent value="batches">
          <BatchesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
