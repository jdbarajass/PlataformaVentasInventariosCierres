-- =====================================================
-- Diagnóstico de ventas, cuentas e inventario — SOLO LECTURA
-- =====================================================
-- Ver docs/AUDITORIA_VENTAS_INVENTARIO_2026-10.md.
--
-- Cómo usarlo: Supabase -> SQL Editor -> pegar TODO este archivo -> Run.
-- Devuelve una sola tabla: una fila por chequeo, con cuántos casos encontró
-- y su valor. Son solo SELECT: no crea, cambia ni borra nada.
--
-- `desde` excluye el historial importado del software local (22/07/2026),
-- que entró sin movimientos a propósito y daría falsos positivos.
-- =====================================================

WITH params AS (
    SELECT TIMESTAMPTZ '2026-07-23 00:00:00-05' AS desde
),
vencidos AS (
    SELECT 'Datáfono' AS medio, amount_cents AS cents, release_date FROM public.card_pending_releases
    WHERE released_at IS NULL AND release_date < CURRENT_DATE
    UNION ALL
    SELECT 'Addi', amount_cents, release_date FROM public.addi_pending_releases
    WHERE released_at IS NULL AND release_date < CURRENT_DATE
    UNION ALL
    SELECT 'SisteCrédito', base_amount_cents, release_date FROM public.sistecredito_pending_releases
    WHERE released_at IS NULL AND release_date < CURRENT_DATE
),
liberados AS (
    SELECT order_id, account_id, 'card' AS method, amount_cents AS cents FROM public.card_pending_releases WHERE released_at IS NOT NULL
    UNION ALL
    SELECT order_id, account_id, 'addi', amount_cents FROM public.addi_pending_releases WHERE released_at IS NOT NULL
    UNION ALL
    SELECT order_id, account_id, 'sistecredito', base_amount_cents FROM public.sistecredito_pending_releases WHERE released_at IS NOT NULL
),
pendientes AS (
    SELECT order_id, 'card' AS method, amount_cents AS cents FROM public.card_pending_releases WHERE released_at IS NULL
    UNION ALL
    SELECT order_id, 'addi', amount_cents FROM public.addi_pending_releases WHERE released_at IS NULL
    UNION ALL
    SELECT order_id, 'sistecredito', base_amount_cents FROM public.sistecredito_pending_releases WHERE released_at IS NULL
),
ventas AS (
    SELECT o.* FROM public.orders o, params
    WHERE o.channel = 'pos' AND o.created_at >= params.desde
),
activas AS (SELECT * FROM ventas WHERE status <> 'cancelled'),
canceladas AS (SELECT * FROM ventas WHERE status = 'cancelled'),

-- Movimientos con el signo real: el ajuste 'out' se guarda en positivo.
mov AS (
    SELECT m.*,
        CASE WHEN m.type = 'out' THEN -ABS(m.qty)
             WHEN m.type IN ('in', 'return') THEN ABS(m.qty)
             ELSE m.qty END AS neto
    FROM public.inventory_movements m
),

-- Cancelaciones repetidas: más de una reversa por cada ítem de la venta.
doble_cancelacion AS (
    SELECT c.id,
        (SELECT COUNT(*) FROM public.inventory_movements m
         WHERE m.reference_id = c.id AND m.type = 'return'
           AND m.note = 'Reversa de venta de mostrador cancelada') AS reversas_stock,
        (SELECT COUNT(*) FROM public.order_items i
         WHERE i.order_id = c.id AND (i.product_id IS NOT NULL OR i.variant_id IS NOT NULL)) AS items,
        (SELECT COUNT(*) FROM public.account_movements a
         WHERE a.reference_id = c.id AND a.type = 'sale_reversal'
           AND a.description = 'Reversa de venta de mostrador cancelada') AS reversas_cuenta,
        (SELECT COUNT(*) FROM public.payments p
         WHERE p.order_id = c.id AND p.account_id IS NOT NULL
           AND p.method NOT IN ('card', 'addi', 'sistecredito')) AS pagos,
        c.total_cents
    FROM canceladas c
),

-- Cancelada, la plata ya había entrado y nunca salió.
cancelada_con_plata AS (
    SELECT l.order_id, SUM(l.cents) AS cents
    FROM liberados l JOIN canceladas c ON c.id = l.order_id
    WHERE NOT EXISTS (
        SELECT 1 FROM public.account_movements a
        WHERE a.reference_id = l.order_id AND a.type = 'sale_reversal' AND a.account_id = l.account_id
    )
    GROUP BY l.order_id
),

-- Datáfono/Addi/SisteCrédito abonado directo (ventas anteriores a sus
-- migraciones, o método cambiado en lote) y cancelado sin reversa.
cancelada_directa AS (
    SELECT p.order_id, SUM(p.amount_cents) AS cents
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id AND o.channel = 'pos' AND o.status = 'cancelled'
    WHERE p.method IN ('card', 'addi', 'sistecredito')
      AND EXISTS (
          SELECT 1 FROM public.account_movements a
          WHERE a.reference_id = p.order_id AND a.type = 'sale' AND a.account_id = p.account_id
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.account_movements a
          WHERE a.reference_id = p.order_id AND a.type = 'sale_reversal' AND a.account_id = p.account_id
      )
    GROUP BY p.order_id
),

-- Editada después del desembolso: entró más plata de la que vale el pago.
doble_desembolso AS (
    SELECT t.order_id, t.method, t.entrada - t.pagos AS exceso_cents
    FROM (
        SELECT e.order_id, e.method, SUM(e.cents) AS entrada,
            (SELECT COALESCE(SUM(p.amount_cents), 0) FROM public.payments p
             WHERE p.order_id = e.order_id AND p.method = e.method) AS pagos
        FROM (SELECT order_id, method, cents FROM liberados
              UNION ALL
              SELECT order_id, method, cents FROM pendientes) e
        JOIN activas v ON v.id = e.order_id
        GROUP BY e.order_id, e.method
    ) t
    WHERE t.entrada > t.pagos
),

-- Venta cancelada que igual tiene plata por llegar (editada tras cancelar).
cancelada_con_pendiente AS (
    SELECT p.order_id, SUM(p.cents) AS cents
    FROM pendientes p JOIN canceladas c ON c.id = p.order_id
    GROUP BY p.order_id
),

-- El método del pago no coincide con la cuenta donde quedó la plata.
metodo_vs_cuenta AS (
    SELECT p.id, p.amount_cents
    FROM public.payments p
    JOIN activas v ON v.id = p.order_id
    JOIN public.accounts c ON c.id = p.account_id
    WHERE c.payment_method <> CASE WHEN p.method = 'card' THEN 'nu' ELSE p.method END
),

-- Ítems de catálogo sin talla en productos que hoy tienen tallas.
sin_talla AS (
    SELECT i.order_id, i.qty
    FROM public.order_items i
    JOIN activas v ON v.id = i.order_id
    WHERE i.product_id IS NOT NULL AND i.variant_id IS NULL AND i.product_talla IS NULL
      AND EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = i.product_id)
),

-- Ítem "fuera de catálogo" cuyo nombre se parece a un producto real.
manual_parecido AS (
    SELECT i.id, i.qty, i.total_cents
    FROM public.order_items i
    JOIN activas v ON v.id = i.order_id
    WHERE i.product_id IS NULL
      AND EXISTS (
          SELECT 1 FROM public.products pr
          WHERE pr.deleted_at IS NULL
            AND (LOWER(pr.title) LIKE '%' || LOWER(TRIM(i.product_title)) || '%'
              OR LOWER(TRIM(i.product_title)) LIKE '%' || LOWER(pr.title) || '%')
      )
),

-- Conciliación: desde el último ajuste registrado (la auditoría guarda el
-- stock exacto en ese momento) o, sin ajuste, solo si nació con movimiento
-- de entrada. Toda diferencia es un cambio de stock sin movimiento.
anclas AS (
    SELECT DISTINCT ON (a.record_id)
        a.record_id, a.created_at, (a.new_data->>'stock_qty')::INT AS stock
    FROM public.audit_logs a
    WHERE a.action = 'inventory_adjustment'
    ORDER BY a.record_id, a.created_at DESC
),
conciliacion AS (
    SELECT pv.id, pv.stock_qty AS actual,
        an.stock + COALESCE((
            SELECT SUM(m.neto) FROM mov m
            WHERE m.variant_id = pv.id AND m.created_at > an.created_at
        ), 0) AS esperado
    FROM public.product_variants pv JOIN anclas an ON an.record_id = pv.id
    UNION ALL
    SELECT pr.id, pr.stock_qty,
        an.stock + COALESCE((
            SELECT SUM(m.neto) FROM mov m
            WHERE m.product_id = pr.id AND m.variant_id IS NULL AND m.created_at > an.created_at
        ), 0)
    FROM public.products pr JOIN anclas an ON an.record_id = pr.id
    WHERE NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = pr.id)
),

resumen AS (
    SELECT 1 AS n, 'Desembolsos vencidos sin liberar (si hay, el cron NO está corriendo)' AS chequeo,
        COUNT(*)::BIGINT AS casos, COALESCE(SUM(cents), 0)::BIGINT AS cents, 'pesos' AS unidad,
        'Más antiguo: ' || COALESCE(MIN(release_date)::TEXT, '-') AS detalle
    FROM vencidos
    UNION ALL
    SELECT 2, 'Cancelada con el stock devuelto más de una vez (stock fantasma)',
        COUNT(*), COALESCE(SUM(reversas_stock - items), 0), 'reversas de más', ''
    FROM doble_cancelacion WHERE items > 0 AND reversas_stock > items
    UNION ALL
    SELECT 3, 'Cancelada con la plata restada más de una vez',
        COUNT(*), COALESCE(SUM(total_cents), 0), 'pesos', ''
    FROM doble_cancelacion WHERE pagos > 0 AND reversas_cuenta > pagos
    UNION ALL
    SELECT 4, 'Cancelada tras el desembolso: la plata sigue en la cuenta',
        COUNT(*), COALESCE(SUM(cents), 0), 'pesos', '' FROM cancelada_con_plata
    UNION ALL
    SELECT 5, 'Cancelada con abono directo de datáfono/Addi/SisteCrédito sin reversa',
        COUNT(*), COALESCE(SUM(cents), 0), 'pesos', '' FROM cancelada_directa
    UNION ALL
    SELECT 6, 'Editada tras el desembolso: la plata entra doble',
        COUNT(*), COALESCE(SUM(exceso_cents), 0), 'pesos', '' FROM doble_desembolso
    UNION ALL
    SELECT 7, 'Venta cancelada con desembolso todavía por llegar',
        COUNT(*), COALESCE(SUM(cents), 0), 'pesos', '' FROM cancelada_con_pendiente
    UNION ALL
    SELECT 8, 'Método de pago distinto a la cuenta que recibió la plata',
        COUNT(*), COALESCE(SUM(amount_cents), 0), 'pesos', 'Reportes y saldos no cuadran' FROM metodo_vs_cuenta
    UNION ALL
    SELECT 9, 'Pagos sin cuenta: la plata no entró a ninguna',
        COUNT(*), COALESCE(SUM(p.amount_cents), 0), 'pesos', ''
    FROM public.payments p JOIN activas v ON v.id = p.order_id WHERE p.account_id IS NULL
    UNION ALL
    SELECT 10, 'Vendido sin talla un producto con tallas (el stock no bajó)',
        COUNT(*), COALESCE(SUM(qty), 0), 'unidades', '' FROM sin_talla
    UNION ALL
    SELECT 11, 'Ítems manuales con nombre parecido a un producto del catálogo (no descontaron)',
        COUNT(*), COALESCE(SUM(qty), 0), 'unidades', '' FROM manual_parecido
    UNION ALL
    SELECT 12, 'Todos los ítems manuales (no descuentan inventario)',
        COUNT(*), COALESCE(SUM(i.qty), 0), 'unidades', ''
    FROM public.order_items i JOIN activas v ON v.id = i.order_id WHERE i.product_id IS NULL
    UNION ALL
    SELECT 13, 'Préstamos a otros almacenes pendientes (el sistema los sigue contando en stock)',
        COUNT(*), COUNT(product_id), 'con producto ligado', 'Cada fila es 1 préstamo; no tiene cantidad'
    FROM public.loans WHERE status = 'pending' AND direction = 'lent'
      -- Desde la migración 00059 descuentan stock; solo cuentan los anteriores.
      AND to_jsonb(loans)->>'stock_deducted' IS NULL
    UNION ALL
    SELECT 14, 'Mercancía que nos prestaron, pendiente (físico sin estar en el sistema)',
        COUNT(*), COUNT(product_id), 'con producto ligado', ''
    FROM public.loans WHERE status = 'pending' AND direction = 'borrowed'
    UNION ALL
    SELECT 15, 'Vendido con más unidades que el stock del sistema (descuadre previo o talla equivocada)',
        COUNT(*), COALESCE(SUM(i.qty - i.stock_deducted), 0), 'unidades', ''
    FROM public.order_items i JOIN activas v ON v.id = i.order_id
    WHERE i.stock_deducted IS NOT NULL AND i.stock_deducted < i.qty
    UNION ALL
    SELECT 16, 'Ventas canceladas desde la migración',
        COUNT(*), COALESCE(SUM(total_cents), 0), 'pesos', 'Cada una devolvió stock automáticamente' FROM canceladas
    UNION ALL
    SELECT 17, 'Canceladas más de 24 horas después de la venta',
        COUNT(*), COALESCE(SUM(c.total_cents), 0), 'pesos', 'Revisar que la mercancía sí haya vuelto'
    FROM canceladas c WHERE c.updated_at > c.created_at + INTERVAL '24 hours'
    UNION ALL
    SELECT 18, 'Ventas editadas después de registradas',
        COUNT(*), COUNT(DISTINCT record_id), 'ventas', ''
    FROM public.audit_logs a, params WHERE a.action = 'pos_sale_edited' AND a.created_at >= params.desde
    UNION ALL
    SELECT 19, 'Productos con stock que no coincide con la suma de sus tallas',
        COUNT(*), COALESCE(SUM(ABS(d.dif)), 0), 'unidades', ''
    FROM (
        SELECT pr.stock_qty - COALESCE(SUM(pv.stock_qty) FILTER (WHERE pv.active), 0) AS dif
        FROM public.products pr JOIN public.product_variants pv ON pv.product_id = pr.id
        GROUP BY pr.id, pr.stock_qty
    ) d WHERE d.dif <> 0
    UNION ALL
    SELECT 20, 'Stock que cambió sin movimiento desde el último ajuste (a favor del sistema: "faltantes")',
        COUNT(*), COALESCE(SUM(actual - esperado), 0), 'unidades', 'Formulario viejo, Excel o carrera'
    FROM conciliacion WHERE actual > esperado
    UNION ALL
    SELECT 21, 'Stock que cambió sin movimiento desde el último ajuste (en contra del sistema)',
        COUNT(*), COALESCE(SUM(esperado - actual), 0), 'unidades', ''
    FROM conciliacion WHERE actual < esperado
    UNION ALL
    SELECT 22, 'Cambios de producto incompletos (salió o entró un solo lado)',
        COUNT(*), COUNT(*), 'cambios', ''
    FROM (
        SELECT reference_id FROM public.inventory_movements
        WHERE type = 'exchange' GROUP BY reference_id HAVING COUNT(*) <> 2
    ) x
    UNION ALL
    SELECT 23, 'Online reembolsada sin devolver stock',
        COUNT(*), COALESCE(SUM(o.total_cents), 0), 'pesos', ''
    FROM public.orders o
    WHERE o.channel = 'online' AND o.status = 'refunded'
      AND NOT EXISTS (SELECT 1 FROM public.inventory_movements m WHERE m.reference_id = o.id AND m.type = 'return')
    UNION ALL
    SELECT 24, 'Saldo de cuenta menos la suma de sus movimientos (saldo inicial implícito total)',
        COUNT(*), COALESCE(SUM(a.balance_cents - COALESCE(m.total, 0)), 0), 'pesos',
        'Dato de referencia, no es error por sí solo'
    FROM public.accounts a
    LEFT JOIN (SELECT account_id, SUM(amount_cents) AS total FROM public.account_movements GROUP BY account_id) m
        ON m.account_id = a.id
)
SELECT n AS "#", chequeo, casos,
    CASE WHEN unidad = 'pesos' THEN ROUND(cents / 100.0) ELSE cents END AS valor,
    unidad, detalle
FROM resumen
ORDER BY n;
