import { boot } from './setup.mjs'
import fs from 'fs'
const {db,fails}=await boot(); if(fails.length){console.log(fails);process.exit(1)}
const q=async(s,p=[])=>(await db.query(s,p)).rows
const one=async(s,p=[])=>(await q(s,p))[0]
await db.exec(`update public.store_settings set sistecredito_margin_pct=5 where id=1`)
let n=0
let colisiones=0
const res=[]
function rec(id,grupo,titulo,esperado,obtenido,ok){res.push({id,grupo,titulo,esperado,obtenido,ok});console.log(`${ok?'OK   ':'FALLA'} ${id} ${titulo}\n       esperado: ${esperado}\n       obtenido: ${obtenido}`)}
async function fx(){ n++
 const a={}
 for(const [k,m] of [['cash','cash'],['nequi','nequi'],['nu','nu'],['addi','addi'],['sc','sistecredito'],['dav','daviplata'],['tr','transfer'],['qr','qr']]){
  a[k]=(await one(`insert into public.accounts(name,payment_method,balance_cents) values($1,$2,100000000) returning id`,[`${k}-${n}`,`${m}`])).id }
 const simple=(await one(`insert into public.products(title,slug,sku,price_cents,cost_cents,stock_qty,active) values($1,$2,$3,5000000,3000000,10,true) returning id`,[`Simple ${n}`,`s-${n}`,`S${n}`])).id
 const talla=(await one(`insert into public.products(title,slug,sku,price_cents,cost_cents,stock_qty,active) values($1,$2,$3,8000000,5000000,0,true) returning id`,[`Casco ${n}`,`c-${n}`,`C${n}`])).id
 const M=(await one(`insert into public.product_variants(product_id,talla,stock_qty,cost_cents) values($1,'M',5,5000000) returning id`,[talla])).id
 const L=(await one(`insert into public.product_variants(product_id,talla,stock_qty,cost_cents) values($1,'L',3,5000000) returning id`,[talla])).id
 return {a,simple,talla,M,L}
}
const bal=async id=>Number((await one(`select balance_cents b from public.accounts where id=$1`,[id])).b)
const sp=async id=>(await one(`select stock_qty s from public.products where id=$1`,[id])).s
const sv=async id=>(await one(`select stock_qty s from public.product_variants where id=$1`,[id])).s
const item=(pid,vid,qty,price,t='Prod')=>({product_id:pid,variant_id:vid,product_title:t,qty,price_cents:price,cost_cents:1000,discount_cents:0,total_cents:qty*price})
const pay=(method,acc,amt)=>({method,account_id:acc,amount_cents:amt,commission_cents:0})
const sale=async(items,pays,{force=false,when=null}={})=>{const t=items.reduce((s,i)=>s+i.total_cents,0)
 for(let i=0;;i++){try{return (await one(`select * from public.create_pos_sale($1::jsonb,$2::jsonb,$3::jsonb,$4,$5::timestamptz)`,[JSON.stringify({subtotal_cents:t,total_cents:t}),JSON.stringify(items),JSON.stringify(pays),force,when]))}catch(e){if(e.code==='23505'&&i<9){colisiones++;continue}throw e}}}
const edit=async(id,items,pays,force=false)=>{const t=items.reduce((s,i)=>s+i.total_cents,0)
 return await one(`select * from public.edit_pos_sale($1,$2::jsonb,$3::jsonb,$4::jsonb,$5)`,[id,JSON.stringify({subtotal_cents:t,total_cents:t}),JSON.stringify(items),JSON.stringify(pays),force])}
const cancel=id=>q(`select public.cancel_pos_sale($1)`,[id])
const due=async()=>{for(const t of ['card','addi','sistecredito'])await db.exec(`update public.${t}_pending_releases set release_date=current_date-1 where released_at is null`)}
const release=async()=>{await due();for(const f of ['card','addi','sistecredito'])await q(`select public.release_${f}_pending()`)}
const P=5000000 // $50.000

// ---- FLUJO BASE
{const f=await fx();const b=await bal(f.a.cash);const o=await sale([item(f.simple,null,2,P)],[pay('cash',f.a.cash,2*P)])
 const mv=await one(`select qty,type from public.inventory_movements where reference_id=$1`,[o.id]);const am=await one(`select amount_cents a,type from public.account_movements where reference_id=$1`,[o.id])
 const it=await one(`select stock_deducted d from public.order_items where order_id=$1`,[o.id])
 rec('A1','Venta','Venta en efectivo, producto sin talla','stock 10→8, caja +$100.000, movimientos -2 y +100000 pesos',`stock ${await sp(f.simple)}, caja +${(await bal(f.a.cash)-b)/100}, mov inv ${mv.qty}/${mv.type}, mov cuenta ${Number(am.a)/100}/${am.type}, descontado ${it.d}, estado ${o.status}/${o.payment_status}`,await sp(f.simple)==8&&await bal(f.a.cash)-b==2*P&&mv.qty==-2&&Number(am.a)==2*P&&it.d==2)}
{const f=await fx();await sale([item(f.talla,f.M,2,P)],[pay('nequi',f.a.nequi,2*P)])
 rec('A2','Venta','Venta con talla (variante)','talla M 5→3, L intacta, producto suma 8→6',`M ${await sv(f.M)}, L ${await sv(f.L)}, producto ${await sp(f.talla)}`,await sv(f.M)==3&&await sv(f.L)==3&&await sp(f.talla)==6)}
for(const [m,k] of [['cash','cash'],['nequi','nequi'],['daviplata','dav'],['transfer','tr'],['nu','nu'],['qr','qr']]){const f=await fx();const b=await bal(f.a[k]);await sale([item(f.simple,null,1,P)],[pay(m,f.a[k],P)])
 const d=await bal(f.a[k])-b;rec(`A3-${m}`,'Medios de pago',`Método ${m}: abono inmediato`,'+$50.000 en su cuenta',`+${d/100}`,d==P)}
for(const [m,k,t,col] of [['card','nu','card','amount_cents'],['addi','addi','addi','amount_cents'],['sistecredito','sc','sistecredito','base_amount_cents']]){const f=await fx();const b=await bal(f.a[k]);const o=await sale([item(f.simple,null,1,P)],[pay(m,f.a[k],P)])
 const d0=await bal(f.a[k])-b;const pend=await one(`select ${col} a,release_date from public.${t}_pending_releases where order_id=$1`,[o.id]);await release();const d1=await bal(f.a[k])-b;await release();const d2=await bal(f.a[k])-b
 const exp=m=='sistecredito'?Math.round(P*1.05):P
 rec(`A4-${m}`,'Medios de pago',`Método ${m}: queda pendiente y luego se libera una sola vez`,`0 hoy; pendiente; +${exp/100} al liberar; repetir no duplica`,`hoy +${d0/100}, pendiente ${Number(pend.a)/100}, liberado +${d1/100}, repetido +${d2/100}`,d0==0&&Number(pend.a)==P&&d1==exp&&d2==exp)}
{const f=await fx();const b1=await bal(f.a.cash),b2=await bal(f.a.nequi),b3=await bal(f.a.nu);const o=await sale([item(f.simple,null,3,P)],[pay('cash',f.a.cash,P),pay('nequi',f.a.nequi,P),pay('card',f.a.nu,P)]);await cancel(o.id)
 const ok=await bal(f.a.cash)==b1&&await bal(f.a.nequi)==b2&&await bal(f.a.nu)==b3&&await sp(f.simple)==10
 const pc=await one(`select count(*)::int c from public.card_pending_releases where order_id=$1`,[o.id])
 rec('A5','Cancelación','Pago combinado (efectivo+Nequi+datáfono) y cancelación el mismo día','Todo vuelve exacto; pendiente borrado',`stock ${await sp(f.simple)}, deltas ${await bal(f.a.cash)-b1}/${await bal(f.a.nequi)-b2}/${await bal(f.a.nu)-b3}, pendientes ${pc.c}`,ok&&pc.c==0)}
{const f=await fx();const b=await bal(f.a.cash);const o=await sale([item(f.talla,f.M,2,P),item(f.simple,null,1,P)],[pay('cash',f.a.cash,3*P)]);await cancel(o.id);const st=await one(`select status,payment_status from public.orders where id=$1`,[o.id])
 const rev=await one(`select count(*)::int c,sum(qty)::int s from public.inventory_movements where reference_id=$1 and type='return'`,[o.id])
 rec('A6','Cancelación','Cancelar venta en efectivo con talla y sin talla','Stock y caja restaurados, estado cancelled/refunded',`M ${await sv(f.M)}, simple ${await sp(f.simple)}, caja ${(await bal(f.a.cash)-b)/100}, ${st.status}/${st.payment_status}, reversas ${rev.c} (${rev.s} u.)`,await sv(f.M)==5&&await sp(f.simple)==10&&await bal(f.a.cash)==b&&st.status=='cancelled'&&st.payment_status=='refunded'&&rev.s==3)}
{const f=await fx();const b=await bal(f.a.addi);const o=await sale([item(f.simple,null,1,P)],[pay('addi',f.a.addi,P)]);await cancel(o.id);await release()
 rec('A7','Cancelación','Cancelar venta Addi ANTES del desembolso','No entra plata nunca',`Addi +${(await bal(f.a.addi)-b)/100}, stock ${await sp(f.simple)}`,await bal(f.a.addi)==b&&await sp(f.simple)==10)}
{const f=await fx();const b=await bal(f.a.cash),bn=await bal(f.a.nequi);const o=await sale([item(f.simple,null,3,P)],[pay('cash',f.a.cash,3*P)]);await edit(o.id,[item(f.simple,null,1,P)],[pay('nequi',f.a.nequi,P)])
 rec('A8','Edición','Editar venta: bajar de 3 a 1 und y pasar de efectivo a Nequi','stock 9, caja 0, Nequi +$50.000',`stock ${await sp(f.simple)}, caja ${(await bal(f.a.cash)-b)/100}, Nequi ${(await bal(f.a.nequi)-bn)/100}`,await sp(f.simple)==9&&await bal(f.a.cash)==b&&await bal(f.a.nequi)-bn==P)}
{const f=await fx();await db.exec(`update public.product_variants set stock_qty=2 where id='${f.L}'`);const o=await sale([item(f.talla,f.L,5,P)],[pay('cash',f.a.cash,5*P)],{force:true});const a=await sv(f.L);const d=(await one(`select stock_deducted d from public.order_items where order_id=$1`,[o.id])).d;await cancel(o.id)
 rec('A9','Venta','Venta forzada: stock 2, vende 5, luego se cancela','0 tras vender (descontó 2), 2 tras cancelar',`tras venta ${a} (descontado ${d}), tras cancelar ${await sv(f.L)}`,a==0&&d==2&&await sv(f.L)==2)}
{const f=await fx();let msg='sin error';await db.exec(`update public.product_variants set stock_qty=1 where id='${f.L}'`);try{await sale([item(f.talla,f.L,2,P)],[pay('cash',f.a.cash,2*P)])}catch(e){msg=e.message}
 const c=await one(`select count(*)::int c from public.order_items where variant_id=$1`,[f.L])
 rec('A10','Venta','Sin stock y sin forzar: la venta se rechaza completa (atómica)','Error, nada guardado',`${msg.slice(0,28)}…, ítems guardados ${c.c}, stock ${await sv(f.L)}`,msg.includes('Stock insuficiente')&&c.c==0&&await sv(f.L)==1)}

// ---- SOSPECHAS
{const f=await fx();const b=await bal(f.a.cash);const o=await sale([item(f.talla,f.M,2,P)],[pay('cash',f.a.cash,2*P)]);await cancel(o.id);await cancel(o.id)
 rec('B1','Cancelación','Cancelar DOS veces la misma venta (2 pantallas abiertas)','Segunda vez rechazada: M=5, caja igual',`M ${await sv(f.M)} (+${await sv(f.M)-5} fantasma), caja ${(await bal(f.a.cash)-b)/100}`,await sv(f.M)==5&&await bal(f.a.cash)==b)}
for(const [m,k] of [['card','nu'],['addi','addi'],['sistecredito','sc']]){const f=await fx();const b=await bal(f.a[k]);const o=await sale([item(f.simple,null,1,P)],[pay(m,f.a[k],P)]);await release();const tras=await bal(f.a[k])-b;await cancel(o.id)
 const rev=await one(`select count(*)::int c from public.account_movements where reference_id=$1 and type='sale_reversal'`,[o.id])
 rec(`B2-${m}`,'Cancelación',`Cancelar venta ${m} DESPUÉS del desembolso`,'La plata sale de la cuenta (o queda un saldo a devolver visible)',`liberado +${tras/100}; tras cancelar sigue +${(await bal(f.a[k])-b)/100}; reversas ${rev.c}; stock devuelto ${await sp(f.simple)}`,await bal(f.a[k])==b)}
for(const [m,k] of [['card','nu'],['addi','addi']]){const f=await fx();const b=await bal(f.a[k]);const o=await sale([item(f.simple,null,1,P)],[pay(m,f.a[k],P)]);await release();await edit(o.id,[item(f.simple,null,1,P)],[pay(m,f.a[k],P)]);await release()
 rec(`B3-${m}`,'Edición',`Editar venta ${m} ya desembolsada, sin cambiar nada (ej. corregir el cliente)`,'Entra una sola vez: +$50.000',`entró +${(await bal(f.a[k])-b)/100}`,await bal(f.a[k])-b==P)}
{const f=await fx();const b=await bal(f.a.nu);const o=await sale([item(f.simple,null,1,P)],[pay('card',f.a.nu,P)]);await cancel(o.id);let err=null;try{await edit(o.id,[item(f.simple,null,1,P)],[pay('card',f.a.nu,P)])}catch(e){err=e.message}await release();const st=await one(`select status from public.orders where id=$1`,[o.id])
 rec('B4','Edición','Editar una venta ya CANCELADA (pantalla vieja)','Rechazado',`error=${err}; estado ${st.status}; cuenta +${(await bal(f.a.nu)-b)/100}; stock ${await sp(f.simple)}`,!!err)}
{const f=await fx();const o=await sale([item(f.simple,null,1,P)],[pay('card',f.a.nu,P)]);await db.exec(`delete from public.card_pending_releases where order_id='${o.id}'; update public.accounts set balance_cents=balance_cents+${P} where id='${f.a.nu}'`);const b=await bal(f.a.nu);await cancel(o.id)
 rec('B5','Cancelación','Venta de datáfono ANTERIOR a la migración 00055 (ya abonada directo) y cancelada hoy','Se reversa',`cuenta ${(await bal(f.a.nu)-b)/100}`,await bal(f.a.nu)==b-P)}
{const f=await fx();const bc=await bal(f.a.cash);const o=await sale([item(f.simple,null,1,P)],[pay('cash',f.a.cash,P)]);await db.exec(`update public.payments set method='card' where order_id='${o.id}'`);await cancel(o.id)
 rec('B6a','Cambio masivo de método','Efectivo→Datáfono con el cambio masivo, luego cancelar','La caja queda como antes',`caja +${(await bal(f.a.cash)-bc)/100}`,await bal(f.a.cash)==bc)}
{const f=await fx();const b=await bal(f.a.nu);const o=await sale([item(f.simple,null,1,P)],[pay('card',f.a.nu,P)]);await db.exec(`update public.payments set method='cash' where order_id='${o.id}'`);await cancel(o.id);const d0=await bal(f.a.nu)-b;await release()
 rec('B6b','Cambio masivo de método','Datáfono→Efectivo con el cambio masivo, luego cancelar y liberar','Cuenta igual (0)',`al cancelar ${d0/100}; tras liberar ${(await bal(f.a.nu)-b)/100}`,await bal(f.a.nu)==b)}
{const f=await fx();const b=await bal(f.a.cash),bn=await bal(f.a.nequi);const o=await sale([item(f.simple,null,1,P)],[pay('cash',f.a.cash,P)]);await db.exec(`update public.payments set method='nequi' where order_id='${o.id}'`);const rep=await one(`select method from public.payments where order_id=$1`,[o.id])
 rec('B6c','Cambio masivo de método','Efectivo→Nequi con el cambio masivo (sin cancelar)','Reportes y saldos dicen lo mismo',`reporte dice ${rep.method}; plata: caja +${(await bal(f.a.cash)-b)/100}, Nequi +${(await bal(f.a.nequi)-bn)/100}`,await bal(f.a.nequi)-bn==P)}
{const f=await fx();await sale([item(f.talla,null,2,P)],[pay('cash',f.a.cash,2*P)]);const a=await sp(f.talla);await sale([item(f.talla,f.L,1,P)],[pay('cash',f.a.cash,P)])
 rec('B7','Inventario','Producto CON tallas vendido sin elegir talla (variant_id nulo)','Rechazado, o descuenta 2 de alguna talla',`producto ${a}; tras otra venta de 1 L: producto ${await sp(f.talla)} (8−3=5 reales); M ${await sv(f.M)}, L ${await sv(f.L)}`,await sp(f.talla)==5)}
{const f=await fx();const o=await sale([item(f.talla,f.M,1,P)],[pay('cash',f.a.cash,P)]);await db.exec(`delete from public.product_variants where id='${f.M}'`);await cancel(o.id);const a=await sp(f.talla);await db.exec(`update public.product_variants set stock_qty=stock_qty where id='${f.L}'`)
 rec('B8','Inventario','Vender talla M, borrar la talla, cancelar la venta','La unidad vuelve a algún lado',`producto tras cancelar ${a}; tras sincronizar ${await sp(f.talla)} (solo L=3)`,await sp(f.talla)==4)}
{const f=await fx();const o=await sale([item(f.simple,null,1,P)],[pay('cash',null,P)]);const t=await one(`select sum(balance_cents)::bigint s from public.accounts where id=any($1::uuid[])`,[Object.values(f.a)])
 const pr=await one(`select count(*)::int c from public.payments where order_id=$1`,[o.id])
 rec('B9','Medios de pago','Pago sin cuenta ("Sin cuenta" en Editar, o nuevo pago agregado al editar)','Debe exigir cuenta',`venta aceptada; pago registrado ${pr.c}; plata acreditada a cuentas ${(Number(t.s)-8*100000000)/100}`,false)}
{const f=await fx();await sale([item(f.simple,null,1,P,'Casco Simple')],[pay('cash',f.a.cash,P)]);const s0=await sp(f.simple);await sale([item(null,null,1,P,'Casco Simple')],[pay('cash',f.a.cash,P)])
 rec('B10','Inventario','Vender como "ítem fuera de catálogo" algo que SÍ existe en catálogo','Debería alertar',`la venta entra, stock sigue en ${await sp(f.simple)} (físico ${s0-1}); sin movimiento`,false)}
{const f=await fx();const leido=await sp(f.simple);await sale([item(f.simple,null,2,P)],[pay('cash',f.a.cash,2*P)]);await db.exec(`update public.products set stock_qty=${leido} where id='${f.simple}'`)
 rec('B11','Inventario','Formulario de producto abierto con stock 10, entra venta de 2, guardar el formulario','Stock 8',`stock ${await sp(f.simple)} (físico 8); movimientos no lo explican`,await sp(f.simple)==8)}
{const f=await fx();await db.exec(`update public.product_variants set stock_qty=10 where id='${f.M}'`);await sale([item(f.talla,f.M,2,P)],[pay('cash',f.a.cash,2*P)]);const nuevo=10;await q(`insert into public.inventory_movements(product_id,variant_id,qty,type,note) values($1,$2,$3,'adjustment','conteo')`,[f.talla,f.M,nuevo-await sv(f.M)]);await db.exec(`update public.product_variants set stock_qty=${nuevo} where id='${f.M}'`)
 rec('B12','Inventario','Conteo físico: se cuentan 10, se venden 2, se digita el 10 después','Stock 8 (o avisar que hubo ventas)',`stock ${await sv(f.M)} (físico 8)`,await sv(f.M)==8)}
{const f=await fx();const lend=(p,v)=>one('select * from public.create_lent_loan($1::jsonb)',[JSON.stringify({product_id:p,variant_id:v,product_title:'Casco',warehouse:'Otro almacén'})])
 const st=(id,s)=>one('select * from public.set_loan_status($1,$2)',[id,s])
 const l=await lend(f.talla,f.M);const mv=await one('select qty,type from public.inventory_movements where reference_id=$1',[l.id])
 rec('B13','Préstamos','Prestar 1 casco a otro almacén','Sistema M 4, con movimiento',`sistema M ${await sv(f.M)}, producto ${await sp(f.talla)}, movimiento ${mv.qty}/${mv.type}`,await sv(f.M)==4&&await sp(f.talla)==7&&mv.qty==-1)
 await st(l.id,'returned');rec('L1','Préstamos','Devolver el préstamo','M vuelve a 5',`M ${await sv(f.M)}`,await sv(f.M)==5)
 await st(l.id,'returned');rec('L2','Préstamos','Marcar devuelto dos veces','No suma doble',`M ${await sv(f.M)}`,await sv(f.M)==5)
 await st(l.id,'pending');rec('L3','Préstamos','Reabrir un préstamo devuelto','Vuelve a descontar',`M ${await sv(f.M)}`,await sv(f.M)==4)
 await st(l.id,'charged');rec('L4','Préstamos','El local paga el préstamo','Sigue descontado',`M ${await sv(f.M)}`,await sv(f.M)==4)
 await q('select public.delete_loan($1)',[l.id]);rec('L5','Préstamos','Borrar un préstamo ya cobrado','No devuelve stock',`M ${await sv(f.M)}`,await sv(f.M)==4)
 const l2=await lend(f.simple,null);await q('select public.delete_loan($1)',[l2.id]);rec('L6','Préstamos','Borrar un préstamo pendiente (error de digitación)','Stock vuelve a 10',`stock ${await sp(f.simple)}`,await sp(f.simple)==10)
 const vieja=await one("insert into public.loans(product_id,product_title,warehouse,direction) values($1,'Viejo','Otro','lent') returning id",[f.simple]);await st(vieja.id,'returned');rec('L7','Préstamos','Devolver un préstamo anterior a la migración','No suma stock inventado',`stock ${await sp(f.simple)}`,await sp(f.simple)==10)
 await db.exec(`update public.products set stock_qty=0 where id='${f.simple}'`);const l3=await lend(f.simple,null);await st(l3.id,'returned');rec('L8','Préstamos','Prestar con stock 0 en el sistema y devolver','Nunca negativo y sin stock inventado',`descontado ${l3.stock_deducted}, stock ${await sp(f.simple)}`,l3.stock_deducted==0&&await sp(f.simple)==0)
 let err='';try{await lend(f.talla,null)}catch(e){err=e.message}const c=await one("select count(*)::int c from public.loans where product_id=$1 and status='pending'",[f.talla]);rec('L9','Préstamos','Prestar un producto con tallas sin elegir talla','Rechazado, sin guardar nada',`${err}; pendientes ${c.c}`,err.includes('talla')&&c.c==0)}
{const f=await fx();const o=await one(`insert into public.orders(customer_email,subtotal_cents,total_cents,status,payment_status,channel) values('c@x.co',${P},${P},'confirmed','paid','online') returning id`);await q(`insert into public.order_items(order_id,product_id,product_title,qty,price_cents,cost_cents,discount_cents,total_cents,stock_deducted) values($1,$2,'x',1,${P},0,0,${P},1)`,[o.id,f.simple]);await db.exec(`update public.products set stock_qty=9 where id='${f.simple}'; update public.orders set status='refunded',payment_status='refunded' where id='${o.id}'`)
 rec('B14','Tienda online','Reembolso desde Stripe/MercadoPago (solo cambia estado en el webhook)','Stock vuelve a 10 o queda alerta',`stock ${await sp(f.simple)}; el webhook no restaura y Cancelar ya no aplica por estar refunded`,await sp(f.simple)==10)}


const ok=res.filter(r=>r.ok).length;console.log(`\nTOTAL ${res.length}: ${ok} OK, ${res.length-ok} FALLA`)
export {db,q,one,fx,sale,cancel,edit,release,item,pay,P}

// ---- Validacion del diagnostico: corre el archivo real sobre la BD con los errores ya sembrados
{
 await db.exec(`update public.product_variants pv set stock_qty=stock_qty`)
 const f=await fx()
 // historial previo a la fecha de corte no debe contar; todo lo sembrado es de hoy
 await sale([item(f.simple,null,1,P)],[pay('card',f.a.nu,P)]) // vencido sin liberar
 await due()
 // semillas para los chequeos restantes
 { const g=await fx(); const c7=await sale([item(g.simple,null,1,P)],[pay('card',g.a.nu,P)]); await cancel(c7.id); await edit(c7.id,[item(g.simple,null,1,P)],[pay('card',g.a.nu,P)])
   await db.exec(`update public.card_pending_releases set release_date=current_date+5 where order_id='${c7.id}'`)
   const t=(await one('select title from public.products where id=$1',[g.simple])).title; await sale([item(null,null,1,P,t)],[pay('cash',g.a.cash,P)])
   await db.exec(`update public.product_variants set stock_qty=1 where id='${g.L}'`); await sale([item(g.talla,g.L,3,P)],[pay('cash',g.a.cash,3*P)],{force:true})
   const c17=await sale([item(g.talla,g.M,1,P)],[pay('cash',g.a.cash,P)]); await cancel(c17.id); await db.exec(`update public.orders set created_at=now()-interval '3 days' where id='${c17.id}'`)
   await db.exec(`insert into public.audit_logs(action,table_name,record_id) values('pos_sale_edited','orders','${c17.id}')`)
   await db.exec(`alter table public.product_variants disable trigger trg_sync_product_stock_from_variants; update public.products set stock_qty=stock_qty+3 where id='${g.talla}'; alter table public.product_variants enable trigger trg_sync_product_stock_from_variants`)
   await q(`insert into public.inventory_movements(product_id,qty,type,reference_id,reference_type) values($1,-1,'exchange',gen_random_uuid(),'exchange')`,[g.simple])
   const h=await fx(); await db.exec(`insert into public.audit_logs(action,table_name,record_id,new_data) values('inventory_adjustment','products','${h.simple}','{"stock_qty":10}'); update public.products set stock_qty=7 where id='${h.simple}'`)
 }
 const sql=fs.readFileSync(new URL('./diagnostico.sql', import.meta.url),'utf8')
 await db.exec(`insert into public.audit_logs(action,table_name,record_id,new_data) values('inventory_adjustment','products','${f.simple}','{"stock_qty":10}')`)
 await db.exec(`select pg_sleep(0.01); update public.products set stock_qty=20 where id='${f.simple}'`)
 const r=await db.query(sql.replace(/^--.*$/gm,''))
 console.log('\nDIAGNOSTICO:')
 for(const x of r.rows)console.log(String(x['#']).padStart(2),String(x.casos).padStart(5),String(x.valor).padStart(12),x.unidad.padEnd(18),x.chequeo)
}
