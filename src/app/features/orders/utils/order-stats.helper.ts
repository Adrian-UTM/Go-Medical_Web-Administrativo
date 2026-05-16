import {
  Order,
  OrderStatsFilters,
  OrderStatsGrouping,
  OrderStatsKpis,
  OrderStatsPeriodPoint,
  OrderStatsPeriodPreset,
  OrderStatsSnapshot,
  OrderStatus,
  OrderStatusSummaryRow,
  TopOrderedProductRow,
} from '../../../models/order.model';

const DEFAULT_FILTERS: OrderStatsFilters = {
  periodPreset: 'this_month',
  grouping: 'day',
};

const STATUS_SEQUENCE: OrderStatus[] = [
  OrderStatus.Draft,
  OrderStatus.PendingReview,
  OrderStatus.PendingPayment,
  OrderStatus.Paid,
  OrderStatus.Processing,
  OrderStatus.Shipped,
  OrderStatus.Delivered,
  OrderStatus.Canceled,
];

interface DateRange {
  start: Date;
  end: Date;
}

export function buildOrderStatsSnapshot(
  orders: Order[],
  filters: Partial<OrderStatsFilters> = {}
): OrderStatsSnapshot {
  const normalizedFilters = normalizeFilters(filters);
  const referenceDate = getAnalyticsReferenceDate(orders);
  const range = resolveDateRange(normalizedFilters, referenceDate);
  const filteredOrders = [...orders]
    .filter(order => isOrderWithinRange(order, range))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return {
    filters: normalizedFilters,
    periodLabel: formatRangeLabel(normalizedFilters.periodPreset, range),
    generatedAt: new Date().toISOString(),
    kpis: buildKpis(filteredOrders),
    periodPoints: buildPeriodPoints(filteredOrders, range, normalizedFilters.grouping),
    statusSummary: buildStatusSummary(filteredOrders),
    topOrderedProducts: buildTopOrderedProducts(filteredOrders),
  };
}

function normalizeFilters(filters: Partial<OrderStatsFilters>): OrderStatsFilters {
  return {
    periodPreset: filters.periodPreset ?? DEFAULT_FILTERS.periodPreset,
    grouping: filters.grouping ?? DEFAULT_FILTERS.grouping,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };
}

function buildKpis(orders: Order[]): OrderStatsKpis {
  const billableOrders = orders.filter(order => order.status !== OrderStatus.Canceled);
  const totalRevenue = roundCurrency(billableOrders.reduce((sum, order) => sum + order.total, 0));

  return {
    totalOrders: orders.length,
    totalRevenue,
    averageOrderValue: billableOrders.length ? roundCurrency(totalRevenue / billableOrders.length) : 0,
    pendingOrders: orders.filter(order => isPendingStatus(order.status)).length,
    paidOrders: orders.filter(order => order.status === OrderStatus.Paid).length,
    deliveredOrders: orders.filter(order => order.status === OrderStatus.Delivered).length,
    canceledOrders: orders.filter(order => order.status === OrderStatus.Canceled).length,
  };
}

function buildStatusSummary(orders: Order[]): OrderStatusSummaryRow[] {
  return STATUS_SEQUENCE.map(status => {
    const scopedOrders = orders.filter(order => order.status === status);
    return {
      status,
      label: getOrderStatusLabel(status),
      count: scopedOrders.length,
      total: roundCurrency(scopedOrders.reduce((sum, order) => sum + order.total, 0)),
    };
  });
}

function buildTopOrderedProducts(orders: Order[]): TopOrderedProductRow[] {
  const registry = new Map<string, TopOrderedProductRow>();

  orders
    .filter(order => order.status !== OrderStatus.Canceled)
    .forEach(order => {
      order.items.forEach(item => {
        const current = registry.get(item.productId);
        if (current) {
          current.unitsOrdered += item.quantity;
          current.totalAmount = roundCurrency(current.totalAmount + item.totalLinePrice);
          return;
        }

        registry.set(item.productId, {
          productId: item.productId,
          productName: item.productName,
          productCategory: item.productCategory,
          unitsOrdered: item.quantity,
          totalAmount: item.totalLinePrice,
        });
      });
    });

  return Array.from(registry.values())
    .sort((a, b) => {
      if (b.unitsOrdered !== a.unitsOrdered) {
        return b.unitsOrdered - a.unitsOrdered;
      }
      return b.totalAmount - a.totalAmount;
    })
    .slice(0, 8);
}

function buildPeriodPoints(orders: Order[], range: DateRange, grouping: OrderStatsGrouping): OrderStatsPeriodPoint[] {
  const buckets = createPeriodBuckets(range, grouping);

  orders.forEach(order => {
    const key = getPeriodKey(new Date(order.createdAt), grouping);
    const bucket = buckets.get(key);
    if (!bucket) {
      return;
    }

    bucket.ordersCount += 1;
    bucket.revenue = roundCurrency(bucket.revenue + (order.status === OrderStatus.Canceled ? 0 : order.total));
  });

  return Array.from(buckets.values());
}

function createPeriodBuckets(range: DateRange, grouping: OrderStatsGrouping): Map<string, OrderStatsPeriodPoint> {
  const buckets = new Map<string, OrderStatsPeriodPoint>();

  if (grouping === 'day') {
    let cursor = startOfDay(range.start);
    while (cursor.getTime() <= range.end.getTime()) {
      const current = new Date(cursor);
      const key = getPeriodKey(current, grouping);
      buckets.set(key, {
        key,
        label: formatDayLabel(current),
        ordersCount: 0,
        revenue: 0,
      });
      cursor = addDays(cursor, 1);
    }

    return buckets;
  }

  if (grouping === 'week') {
    let cursor = startOfWeek(range.start);
    while (cursor.getTime() <= range.end.getTime()) {
      const current = new Date(cursor);
      const key = getPeriodKey(current, grouping);
      buckets.set(key, {
        key,
        label: `${formatDayNumber(current)}-${formatDayMonth(endOfWeek(current))}`,
        ordersCount: 0,
        revenue: 0,
      });
      cursor = addDays(cursor, 7);
    }

    return buckets;
  }

  let cursor = startOfMonth(range.start);
  while (cursor.getTime() <= range.end.getTime()) {
    const current = new Date(cursor);
    const key = getPeriodKey(current, grouping);
    buckets.set(key, {
      key,
      label: formatMonthLabel(current),
      ordersCount: 0,
      revenue: 0,
    });
    cursor = addMonths(cursor, 1);
  }

  return buckets;
}

function getAnalyticsReferenceDate(orders: Order[]): Date {
  const now = new Date();
  const latestOrderTime = orders
    .map(order => new Date(order.createdAt).getTime())
    .reduce((max, value) => Math.max(max, value), 0);

  return new Date(Math.max(now.getTime(), latestOrderTime));
}

function resolveDateRange(filters: OrderStatsFilters, referenceDate: Date): DateRange {
  switch (filters.periodPreset) {
    case 'today':
      return { start: startOfDay(referenceDate), end: endOfDay(referenceDate) };
    case 'this_week':
      return { start: startOfWeek(referenceDate), end: endOfWeek(referenceDate) };
    case 'this_month':
      return { start: startOfMonth(referenceDate), end: endOfMonth(referenceDate) };
    case 'last_7_days':
      return { start: startOfDay(addDays(referenceDate, -6)), end: endOfDay(referenceDate) };
    case 'last_30_days':
      return { start: startOfDay(addDays(referenceDate, -29)), end: endOfDay(referenceDate) };
    case 'custom':
      return resolveCustomDateRange(filters, referenceDate);
    default:
      return { start: startOfMonth(referenceDate), end: endOfMonth(referenceDate) };
  }
}

function resolveCustomDateRange(filters: OrderStatsFilters, referenceDate: Date): DateRange {
  const parsedStart = filters.dateFrom ? parseDateInput(filters.dateFrom) : null;
  const parsedEnd = filters.dateTo ? parseDateInput(filters.dateTo) : null;

  if (!parsedStart || !parsedEnd) {
    return { start: startOfDay(addDays(referenceDate, -6)), end: endOfDay(referenceDate) };
  }

  return parsedStart <= parsedEnd
    ? { start: startOfDay(parsedStart), end: endOfDay(parsedEnd) }
    : { start: startOfDay(parsedEnd), end: endOfDay(parsedStart) };
}

function formatRangeLabel(preset: OrderStatsPeriodPreset, range: DateRange): string {
  const from = formatReadableDate(range.start);
  const to = formatReadableDate(range.end);

  switch (preset) {
    case 'today':
      return `Hoy · ${from}`;
    case 'this_week':
      return `Esta semana · ${from} al ${to}`;
    case 'this_month':
      return `Este mes · ${formatMonthLong(range.start)}`;
    case 'last_7_days':
      return `Ultimos 7 dias · ${from} al ${to}`;
    case 'last_30_days':
      return `Ultimos 30 dias · ${from} al ${to}`;
    case 'custom':
      return `Rango personalizado · ${from} al ${to}`;
    default:
      return `${from} al ${to}`;
  }
}

function isOrderWithinRange(order: Order, range: DateRange): boolean {
  const createdAt = new Date(order.createdAt).getTime();
  return createdAt >= range.start.getTime() && createdAt <= range.end.getTime();
}

function isPendingStatus(status: OrderStatus): boolean {
  return [
    OrderStatus.Draft,
    OrderStatus.PendingReview,
    OrderStatus.PendingPayment,
    OrderStatus.Processing,
    OrderStatus.Shipped,
  ].includes(status);
}

function getPeriodKey(date: Date, grouping: OrderStatsGrouping): string {
  if (grouping === 'day') {
    return toDateInputValue(date);
  }

  if (grouping === 'week') {
    return toDateInputValue(startOfWeek(date));
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function getOrderStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    [OrderStatus.Draft]: 'Borrador',
    [OrderStatus.PendingReview]: 'Pendiente de revision',
    [OrderStatus.PendingPayment]: 'Pendiente de pago',
    [OrderStatus.Paid]: 'Pagado',
    [OrderStatus.Processing]: 'En proceso',
    [OrderStatus.Shipped]: 'Enviado',
    [OrderStatus.Delivered]: 'Entregado',
    [OrderStatus.Canceled]: 'Cancelado',
  };

  return labels[status] ?? status;
}

function parseDateInput(value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatReadableDate(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatMonthLong(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    month: 'short',
  }).format(date);
}

function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function formatDayNumber(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
  }).format(date);
}

function formatDayMonth(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return startOfDay(addDays(date, offset));
}

function endOfWeek(date: Date): Date {
  return endOfDay(addDays(startOfWeek(date), 6));
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
