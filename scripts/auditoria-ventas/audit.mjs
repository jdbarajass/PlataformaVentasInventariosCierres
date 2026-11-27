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
{const f=await fx();const b=await bal(f.a.cash);const o=await sale([item(f.talla,f.M,2,P)],[pay('cash',f.a.cash,2*P)]);await cancel(o.id);let e1='';try{await cancel(o.id)}catch(e){e1=e.message}
 rec('B1','Cancelación','Cancelar DOS veces la misma venta (2 pantallas abiertas)','Segunda vez rechazada: M=5, caja igual',`${e1||'sin error'}; M ${await sv(f.M)} (+${await sv(f.M)-5} fantasma), caja ${(await bal(f.a.cash)-b)/100}`,e1.includes('ya está cancelada')&&await sv(f.M)==5&&await bal(f.a.cash)==b)}
for(const [m,k] of [['card','nu'],['addi','addi'],['sistecredito','sc']]){const f=await fx();const b=await bal(f.a[k]);const o=await sale([item(f.simple,null,1,P)],[pay(m,f.a[k],P)]);await release();const tras=await bal(f.a[k])-b;await cancel(o.id)
 const rev=await one(`select count(*)::int c from public.account_movements where reference_id=$1 and type='sale_reversal'`,[o.id])
 rec(`B2-${m}`,'Cancelación',`Cancelar venta ${m} DESPUÉS del desembolso`,'La plata sale de la cuenta (o queda un saldo a devolver visible)',`liberado +${tras/100}; tras cancelar sigue +${(await bal(f.a[k])-b)/100}; reversas ${rev.c}; stock devuelto ${await sp(f.simple)}`,await bal(f.a[k])==b)}
for(const [m,k] of [['card','nu'],['addi','addi']]){const f=await fx();const b=await bal(f.a[k]);const o=await sale([item(f.simple,null,1,P)],[pay(m,f.a[k],P)]);await release();await edit(o.id,[item(f.simple,null,1,P)],[pay(m,f.a[k],P)]);await release()
 rec(`B3-${m}`,'Edición',`Editar venta ${m} ya desembolsada, sin cambiar nada (ej. corregir el cliente)`,'Entra una sola vez: +$50.000',`entró +${(await bal(f.a[k])-b)/100}`,await bal(f.a[k])-b==P)}
{const f=await fx();const b=await bal(f.a.nu);const o=await sale([item(f.simple,null,1,P)],[pay('card',f.a.nu,P)]);await cancel(o.id);let err=null;try{await edit(o.id,[item(f.simple,null,1,P)],[pay('card',f.a.nu,P)])}catch(e){err=e.message}await release();const st=await one(`select status from public.orders where id=$1`,[o.id])
 rec('B4','Edición','Editar una venta ya CANCELADA (pantalla vieja)','Rechazado',`error=${err}; estado ${st.status}; cuenta +${(await bal(f.a.nu)-b)/100}; stock ${await sp(f.simple)}`,!!err)}
{const f=await fx();const o=await sale([item(f.simple,null,1,P)],[pay('card',f.a.nu,P)]);await db.exec(`delete from public.card_pending_releases where order_id='${o.id}'; update public.accounts set balance_cents=balance_cents+${P} where id='${f.a.nu}'; insert into public.account_movements(account_id,type,amount_cents,description,reference_id,reference_type) values('${f.a.nu}','sale',${P},'Venta de mostrador (antes de la 00055)','${o.id}','order')`);const b=await bal(f.a.nu);await cancel(o.id)
 rec('B5','Cancelación','Venta de datáfono ANTERIOR a la migración 00055 (ya abonada directo) y cancelada hoy','Se reversa',`cuenta ${(await bal(f.a.nu)-b)/100}`,await bal(f.a.nu)==b-P)}
{const f=await fx();const bc=await bal(f.a.cash);const o=await sale([item(f.simple,null,1,P)],[pay('cash',f.a.cash,P)]);await q(`select public.change_pos_payment_method($1,'card',$2)`,[o.id,f.a.nu]);await cancel(o.id)
 rec('B6a','Cambio masivo de método','Efectivo→Datáfono con el cambio masivo, luego cancelar','La caja queda como antes',`caja +${(await bal(f.a.cash)-bc)/100}`,await bal(f.a.cash)==bc)}
{const f=await fx();const b=await bal(f.a.nu);const o=await sale([item(f.simple,null,1,P)],[pay('card',f.a.nu,P)]);await q(`select public.change_pos_payment_method($1,'cash',$2)`,[o.id,f.a.cash]);await cancel(o.id);const d0=await bal(f.a.nu)-b;await release()
 rec('B6b','Cambio masivo de método','Datáfono→Efectivo con el cambio masivo, luego cancelar y liberar','Cuenta igual (0)',`al cancelar ${d0/100}; tras liberar ${(await bal(f.a.nu)-b)/100}`,await bal(f.a.nu)==b)}
{const f=await fx();const b=await bal(f.a.cash),bn=await bal(f.a.nequi);const o=await sale([item(f.simple,null,1,P)],[pay('cash',f.a.cash,P)]);await q(`select public.change_pos_payment_method($1,'nequi',$2)`,[o.id,f.a.nequi]);const rep=await one(`select method from public.payments where order_id=$1`,[o.id])
 rec('B6c','Cambio masivo de método','Efectivo→Nequi con el cambio masivo (sin cancelar)','Reportes y saldos dicen lo mismo',`reporte dice ${rep.method}; plata: caja +${(await bal(f.a.cash)-b)/100}, Nequi +${(await bal(f.a.nequi)-bn)/100}`,await bal(f.a.nequi)-bn==P)}
// ---- 00068: casos extra de plata
{const f=await fx();const b=await bal(f.a.nu);const o=await sale([item(f.simple,null,1,P)],[pay('card',f.a.nu,P)]);await release();await edit(o.id,[item(f.simple,null,1,3000000)],[pay('card',f.a.nu,3000000)]);const d0=await bal(f.a.nu)-b;await release()
 rec('M1','Edición','Editar venta de datáfono ya desembolsada bajando el valor a $30.000','Queda +$30.000 (sale $50.000, entra $30.000 al desembolsar)',`tras editar ${d0/100}; tras liberar ${(await bal(f.a.nu)-b)/100}`,await bal(f.a.nu)-b==3000000)}
{const f=await fx();const bn=await bal(f.a.nu),bc=await bal(f.a.cash);const o=await sale([item(f.simple,null,1,P)],[pay('card',f.a.nu,P)],{when:new Date(Date.now()-10*864e5).toISOString()});await release();await q(`select public.change_pos_payment_method($1,'cash',$2)`,[o.id,f.a.cash])
 rec('M2','Cambio de método','Venta de datáfono de hace 10 días, ya desembolsada, pasada a efectivo','NU vuelve a 0 y la caja +$50.000 de una vez',`NU ${(await bal(f.a.nu)-bn)/100}, caja ${(await bal(f.a.cash)-bc)/100}`,await bal(f.a.nu)==bn&&await bal(f.a.cash)-bc==P)}
{const f=await fx();const o=await sale([item(f.simple,null,2,P)],[pay('cash',f.a.cash,P),pay('nequi',f.a.nequi,P)]);let e='';try{await q(`select public.change_pos_payment_method($1,'qr',$2)`,[o.id,f.a.qr])}catch(x){e=x.message}
 rec('M3','Cambio de método','Cambio de método en una venta con dos pagos','Rechazado (solo ventas de un pago)',e||'aceptado',e.includes('solo para ventas con un pago'))}
{const f=await fx();let e7='';try{await sale([item(f.talla,null,2,P)],[pay('cash',f.a.cash,2*P)])}catch(e){e7=e.message};await sale([item(f.talla,f.L,1,P)],[pay('cash',f.a.cash,P)])
 const c7=await one(`select count(*)::int c from public.order_items where product_id=$1 and variant_id is null`,[f.talla])
 rec('B7','Inventario','Producto CON tallas vendido sin elegir talla (variant_id nulo)','Rechazado, o descuenta 2 de alguna talla',`${e7||'aceptada'}; ítems sin talla ${c7.c}; tras otra venta de 1 L: producto ${await sp(f.talla)} (8−1=7); M ${await sv(f.M)}, L ${await sv(f.L)}`,e7.includes('tiene tallas')&&c7.c==0&&await sp(f.talla)==7&&await sv(f.L)==2)}
// B7b: venta vieja de un producto que después se volvió con tallas (las 34 de YJBMOTOCOM)
{const f=await fx();const vieja=(await one(`insert into public.products(title,slug,sku,price_cents,cost_cents,stock_qty,active) values($1,$2,$3,5000000,3000000,10,true) returning id`,[`Chaqueta vieja ${n}`,`cv-${n}`,`CV${n}`])).id
 const o=await sale([item(vieja,null,1,P)],[pay('cash',f.a.cash,P)])
 const S=(await one(`insert into public.product_variants(product_id,talla,stock_qty,cost_cents) values($1,'S',4,3000000) returning id`,[vieja])).id
 const antes=await sp(vieja);await edit(o.id,[item(vieja,null,1,P)],[pay('nequi',f.a.nequi,P)]);const tras=await sp(vieja);const it=await one(`select stock_deducted d from public.order_items where order_id=$1`,[o.id])
 let e=''; try{await edit(o.id,[item(vieja,null,2,P)],[pay('nequi',f.a.nequi,2*P)])}catch(x){e=x.message}
 await cancel(o.id);const audit=await one(`select count(*)::int c from public.audit_logs where action='stock_return_sin_talla' and record_id=$1`,[o.id])
 rec('B7b','Inventario','Venta vieja sin talla de un producto que hoy tiene tallas: editar y cancelar','Editar sin cambiarla se puede (stock igual); subirle la cantidad sin talla se rechaza; cancelar deja aviso y no inventa unidades',`stock ${antes}→${tras} (S ${await sv(S)}), descontado guardado ${it.d}; subir: ${e||'aceptado'}; tras cancelar ${await sp(vieja)}, avisos ${audit.c}`,antes==4&&tras==4&&it.d==1&&e.includes('tiene tallas')&&await sp(vieja)==4&&audit.c==1)}
{const f=await fx();const o=await sale([item(f.talla,f.M,1,P)],[pay('cash',f.a.cash,P)]);await db.exec(`delete from public.product_variants where id='${f.M}'`);await cancel(o.id);const a=await sp(f.talla);await db.exec(`update public.product_variants set stock_qty=stock_qty where id='${f.L}'`)
 const m8=await one(`select stock_qty s, active from public.product_variants where product_id=$1 and talla='M'`,[f.talla])
 rec('B8','Inventario','Vender talla M, borrar la talla, cancelar la venta','La unidad vuelve a algún lado',`producto tras cancelar ${a}; tras sincronizar ${await sp(f.talla)}; talla M vuelta a crear con ${m8?.s} (activa ${m8?.active})`,await sp(f.talla)==4&&m8?.s==1&&m8?.active===true)}
{const f=await fx();const o=await sale([item(f.talla,f.M,2,P)],[pay('cash',f.a.cash,2*P)]);const tal=await one(`select product_talla t from public.order_items where order_id=$1`,[o.id])
 await db.exec(`delete from public.product_variants where id='${f.M}'`);const M2=(await one(`insert into public.product_variants(product_id,talla,stock_qty,cost_cents) values($1,'m',1,5000000) returning id`,[f.talla])).id;await cancel(o.id)
 const nM=await one(`select count(*)::int c from public.product_variants where product_id=$1 and upper(talla)='M'`,[f.talla])
 rec('B8b','Inventario','Vender 2 de la M, borrarla, crearla otra vez ("m") y cancelar','Las 2 unidades vuelven a la M nueva, sin duplicar la talla',`talla guardada "${tal.t}"; M nueva ${await sv(M2)}, tallas M ${nM.c}, producto ${await sp(f.talla)}`,tal.t=='M'&&await sv(M2)==3&&nM.c==1&&await sp(f.talla)==6)}
{const f=await fx();let e9='';try{await sale([item(f.simple,null,1,P)],[pay('cash',null,P)])}catch(e){e9=e.message}
 const o9=await sale([item(f.simple,null,1,P)],[pay('cash',f.a.cash,P)]);let e9b='';try{await edit(o9.id,[item(f.simple,null,1,P)],[pay('cash',null,P)])}catch(e){e9b=e.message}
 rec('B9','Medios de pago','Pago sin cuenta ("Sin cuenta" en Editar, o nuevo pago agregado al editar)','Debe exigir cuenta (al vender y al editar)',`vender: ${e9||'aceptada'}; editar: ${e9b||'aceptada'}; stock ${await sp(f.simple)} (9: solo la venta buena)`,e9.includes('debe tener una cuenta')&&e9b.includes('debe tener una cuenta')&&await sp(f.simple)==9)}
{const f=await fx();await sale([item(f.simple,null,1,P,'Casco Simple')],[pay('cash',f.a.cash,P)]);const s0=await sp(f.simple);await sale([item(null,null,1,P,'Casco Simple')],[pay('cash',f.a.cash,P)])
 // Decisión del usuario (2026-10-31): el ítem manual se permite sin confirmación (reventa de otros locales).
 // Desde 2026-11-27 Registrar Venta avisa en pantalla si el nombre coincide con un producto del catálogo
 // (lib/coincidencia-catalogo.ts, con pruebas en __tests__/lib/coincidencia-catalogo.test.ts).
 rec('B10','Inventario','Vender como "ítem fuera de catálogo" algo que SÍ existe en catálogo','Se permite (decisión del usuario) y la pantalla avisa',`la venta entra, stock sigue en ${await sp(f.simple)} (físico ${s0-1}) — aviso en Registrar Venta, probado en vitest`,await sp(f.simple)==s0)}
const adj=(p,v,type,qty,expected=null)=>one(`select * from public.adjust_inventory($1,$2,$3,$4,$5,'prueba',null)`,[p,v,type,qty,expected])
{const f=await fx();const alAbrir=await sp(f.simple);await sale([item(f.simple,null,2,P)],[pay('cash',f.a.cash,2*P)])
 // El formulario ya no escribe stock_qty: solo ajusta si la cantidad del formulario cambió respecto a la que mostró al abrir.
 const formulario=alAbrir; if(formulario!==alAbrir) await adj(f.simple,null,'adjustment',formulario,alAbrir)
 const s1=await sp(f.simple); await adj(f.simple,null,'adjustment',alAbrir+1,alAbrir)
 rec('B11','Inventario','Formulario de producto abierto con stock 10, entra venta de 2, guardar el formulario','Stock 8; si en el formulario se sube 1, queda 9',`sin tocar la cantidad: ${s1}; subiendo 1 en el formulario: ${await sp(f.simple)}`,s1==8&&await sp(f.simple)==9)}
{const f=await fx();await db.exec(`update public.product_variants set stock_qty=10 where id='${f.M}'`);const visto=await sv(f.M);await sale([item(f.talla,f.M,2,P)],[pay('cash',f.a.cash,2*P)]);const r=await adj(f.talla,f.M,'adjustment',10,visto)
 const mv=await one(`select qty from public.inventory_movements where id=$1`,[r.movement_id])
 rec('B12','Inventario','Conteo físico: se cuentan 10, se venden 2, se digita el 10 después','Stock 8 (o avisar que hubo ventas)',`stock ${await sv(f.M)} (físico 8); vendidas en medio ${r.sold_meanwhile}; movimiento ${mv.qty}`,await sv(f.M)==8&&r.sold_meanwhile==2&&mv.qty==0)}
{const f=await fx();let e='';try{await adj(f.talla,null,'in',5)}catch(x){e=x.message};const r=await adj(f.simple,null,'out',3);let e2='';try{await adj(f.simple,null,'out',50)}catch(x){e2=x.message};const r2=await adj(f.simple,null,'adjustment',4)
 rec('B12b','Inventario','Ajustes: total de un producto con tallas, salida, salida mayor al stock y ajuste a cantidad final','Rechaza el total con tallas y el negativo; salida 10→7; ajuste a 4',`con tallas: ${e||'aceptado'}; salida ${r.previous_stock}→${r.new_stock}; negativo: ${e2||'aceptado'}; ajuste final ${r2.new_stock}; producto con tallas ${await sp(f.talla)}`,e.includes('tiene tallas')&&r.new_stock==7&&e2.includes('negativo')&&r2.new_stock==4&&await sp(f.talla)==8)}
// ---- PRÉSTAMOS (migración 00062: prestar no mueve inventario; cobrar = venta)
{const f=await fx();const lend=(p,v)=>one('select * from public.create_lent_loan($1::jsonb)',[JSON.stringify({product_id:p,variant_id:v,product_title:'Casco',warehouse:'Otro almacén'})])
 const borrow=(p,v,t='Guante prestado')=>one("insert into public.loans(product_id,variant_id,product_title,warehouse,direction) values($1,$2,$3,'Local vecino','borrowed') returning *",[p,v,t])
 const st=(id,s)=>one('select * from public.set_loan_status($1,$2)',[id,s])
 const ord=t=>JSON.stringify({subtotal_cents:t,total_cents:t,customer_name:'Otro almacén'})
 const charge=(id,items,pays)=>{const t=items.reduce((s,i)=>s+i.total_cents,0);return one('select * from public.charge_lent_loan($1,$2::jsonb,$3::jsonb,$4::jsonb,null)',[id,ord(t),JSON.stringify(items),JSON.stringify(pays)])}
 const sell=(id,items,pays)=>{const t=items.reduce((s,i)=>s+i.total_cents,0);return one('select * from public.sell_borrowed_loan($1,$2::jsonb,$3::jsonb,$4::jsonb,null)',[id,ord(t),JSON.stringify(items),JSON.stringify(pays)])}
 const close=(id,m,o={})=>one('select * from public.close_borrowed_loan($1,$2,$3,$4,$5,$6,null,null)',[id,m,o.p||null,o.v||null,o.amt||null,o.acc||null])
 const fails=async fn=>{try{await fn();return ''}catch(e){return e.message}}
 const l=await lend(f.talla,f.M);const mv=await one('select count(*)::int c from public.inventory_movements where reference_id=$1',[l.id])
 rec('B13','Préstamos','Prestar 1 casco a otro almacén','El inventario no cambia (M 5), sin movimiento',`sistema M ${await sv(f.M)}, movimientos ${mv.c}`,await sv(f.M)==5&&mv.c==0)
 await st(l.id,'returned');rec('L1','Préstamos','Devolver el préstamo','M sigue en 5',`M ${await sv(f.M)}, estado ${(await one('select status from public.loans where id=$1',[l.id])).status}`,await sv(f.M)==5)
 await st(l.id,'pending');rec('L3','Préstamos','Reabrir un préstamo devuelto','M sigue en 5',`M ${await sv(f.M)}`,await sv(f.M)==5)
 const b0=await bal(f.a.cash);const c1=await charge(l.id,[item(f.talla,f.M,1,P)],[pay('cash',f.a.cash,P)]);const o1=await one('select status,customer_name from public.orders where id=$1',[c1.sale_order_id])
 rec('L4','Préstamos','El local paga: Cobrar crea la venta','M 4, caja +$50.000, préstamo cobrado con su venta',`M ${await sv(f.M)}, caja +${(await bal(f.a.cash)-b0)/100}, préstamo ${c1.status}, venta ${o1.status} a ${o1.customer_name}`,await sv(f.M)==4&&await bal(f.a.cash)-b0==P&&c1.status=='charged'&&o1.customer_name=='Otro almacén')
 const e2=await fails(()=>charge(l.id,[item(f.talla,f.M,1,P)],[pay('cash',f.a.cash,P)]))
 rec('L4b','Préstamos','Cobrar dos veces el mismo préstamo','Rechazado, sin segunda venta',`${e2}; M ${await sv(f.M)}`,e2.includes('no está pendiente')&&await sv(f.M)==4)
 const e3=await fails(()=>st(l.id,'pending'));const e3b=await fails(()=>st(l.id,'charged'))
 rec('L4c','Préstamos','Reabrir a mano un préstamo cobrado / marcar "cobrado" sin venta','Rechazado (se reabre cancelando la venta)',`${e3} | ${e3b}`,e3.includes('cancela la venta')&&e3b.includes('Cobrar'))
 const e4=await fails(()=>q('select public.delete_loan($1)',[l.id]))
 rec('L5','Préstamos','Borrar un préstamo ya cobrado con venta','Rechazado',e4,e4.includes('no se puede eliminar'))
 await cancel(c1.sale_order_id);const r5=await one('select status,sale_order_id from public.loans where id=$1',[l.id])
 rec('L5b','Préstamos','Cancelar la venta del cobro','Préstamo vuelve a pendiente, M vuelve a 5',`préstamo ${r5.status}, venta ${r5.sale_order_id}, M ${await sv(f.M)}, caja +${(await bal(f.a.cash)-b0)/100}`,r5.status=='pending'&&r5.sale_order_id==null&&await sv(f.M)==5&&await bal(f.a.cash)==b0)
 const l2=await lend(f.simple,null);await q('select public.delete_loan($1)',[l2.id]);const g2=await one('select count(*)::int c from public.loans where id=$1',[l2.id])
 rec('L6','Préstamos','Borrar un préstamo pendiente (error de digitación)','Se borra y el stock sigue en 10',`existe ${g2.c}, stock ${await sp(f.simple)}`,g2.c==0&&await sp(f.simple)==10)
 await db.exec(`update public.products set stock_qty=0 where id='${f.simple}'`);const l3=await lend(f.simple,null);const c3=await charge(l3.id,[item(f.simple,null,1,P)],[pay('cash',f.a.cash,P)])
 rec('L8','Préstamos','Cobrar con stock 0 en el sistema','La venta entra y el stock no queda negativo',`préstamo ${c3.status}, stock ${await sp(f.simple)}`,c3.status=='charged'&&await sp(f.simple)==0)
 await db.exec(`update public.products set stock_qty=10 where id='${f.simple}'`)
 // Debemos
 const d=await borrow(f.simple,null);const bn=await bal(f.a.nequi);const manual={product_id:null,variant_id:null,product_title:'Guante prestado',qty:1,price_cents:P,cost_cents:3000000,discount_cents:0,total_cents:P}
 const s1=await sell(d.id,[manual],[pay('nequi',f.a.nequi,P)])
 rec('D1','Debemos','Vender lo que nos prestaron','Venta manual; nuestro stock sigue en 10; deuda sigue pendiente',`stock ${await sp(f.simple)}, nequi +${(await bal(f.a.nequi)-bn)/100}, deuda ${s1.status}, venta ${!!s1.sale_order_id}`,await sp(f.simple)==10&&await bal(f.a.nequi)-bn==P&&s1.status=='pending'&&!!s1.sale_order_id)
 const d2=await borrow(f.simple,null);const e5=await fails(()=>sell(d2.id,[item(f.simple,null,1,P)],[pay('cash',f.a.cash,P)]))
 rec('D2','Debemos','Vender lo prestado como producto de catálogo','Rechazado (no toca nuestro inventario)',`${e5}; stock ${await sp(f.simple)}`,e5.includes('inventario')&&await sp(f.simple)==10)
 const e6=await fails(()=>close(d.id,'same_unit'));const e6b=await fails(()=>st(d.id,'returned'))
 rec('D3','Debemos','Devolver "la misma unidad" de algo que ya se vendió','Rechazado',`${e6} | ${e6b}`,e6.includes('ya se vendió')&&e6b.includes('ya se vendió'))
 const bc=await bal(f.a.cash);const c7=await close(d.id,'money',{amt:3500000,acc:f.a.cash});const am=await one("select type,amount_cents a from public.account_movements where reference_id=$1",[d.id]);const ic=await one('select cost_cents c from public.order_items where order_id=$1',[s1.sale_order_id])
 rec('D4','Debemos','Pagarle en plata al otro local','Caja -$35.000 como pago a proveedor; costo de la venta = $35.000; deuda pagada',`caja ${(await bal(f.a.cash)-bc)/100}, mov ${am.type}/${Number(am.a)/100}, costo venta ${ic.c/100}, deuda ${c7.status}/${c7.close_method}`,await bal(f.a.cash)-bc==-3500000&&am.type=='invoice_payment'&&ic.c==3500000&&c7.status=='charged')
 const e7=await fails(()=>q('select public.delete_loan($1)',[d.id]))
 rec('D5','Debemos','Borrar una deuda ya pagada','Rechazado',e7,e7.includes('no se puede eliminar'))
 const d3=await borrow(f.talla,f.L,'Casco prestado');const m0=await sv(f.L);const c8=await close(d3.id,'restock_unit',{p:f.talla,v:f.L});const mv8=await one('select qty,type from public.inventory_movements where reference_id=$1',[d3.id])
 rec('D6','Debemos','Devolver una unidad igual que llegó de surtido (ya ingresada)','L baja 1 con movimiento',`L ${m0}→${await sv(f.L)}, mov ${mv8.qty}/${mv8.type}, deuda ${c8.status}/${c8.close_method}`,await sv(f.L)==m0-1&&mv8.qty==-1&&c8.status=='returned')
 const d4=await borrow(null,null,'Algo fuera de catálogo');const c9=await close(d4.id,'restock_unit');const mv9=await one('select count(*)::int c from public.inventory_movements where reference_id=$1',[d4.id])
 rec('D7','Debemos','Devolver una unidad de surtido que aún NO está ingresada','Inventario igual, deuda cerrada',`movimientos ${mv9.c}, deuda ${c9.status}`,mv9.c==0&&c9.status=='returned')
 const d5=await borrow(null,null,'Casco X');const e10=await fails(()=>close(d5.id,'restock_unit',{p:f.talla}))
 rec('D8','Debemos','Devolver de surtido un producto con tallas sin elegir talla','Rechazado',e10,e10.includes('talla'))
 const d6=await borrow(null,null,'Algo');const c11=await st(d6.id,'returned')
 rec('D9','Debemos','Marcar devuelto (misma unidad) una deuda sin vender','Cerrada como misma unidad',`${c11.status}/${c11.close_method}`,c11.status=='returned'&&c11.close_method=='same_unit')
 const d7=await borrow(null,null,'Otra');const s12=await sell(d7.id,[{...manual,product_title:'Otra'}],[pay('cash',f.a.cash,P)]);await cancel(s12.sale_order_id);const r12=await one('select status,sale_order_id from public.loans where id=$1',[d7.id])
 rec('D10','Debemos','Cancelar la venta de lo prestado','La deuda sigue pendiente, sin venta enlazada',`${r12.status}, venta ${r12.sale_order_id}`,r12.status=='pending'&&r12.sale_order_id==null)}
{const f=await fx();const online=async(paid)=>{const o=await one(`insert into public.orders(customer_email,subtotal_cents,total_cents,status,payment_status,channel) values('c@x.co',${P},${P},$1,$2,'online') returning id`,[paid?'confirmed':'pending',paid?'paid':'pending']);return o}
 const o=await online(true);await q(`insert into public.order_items(order_id,product_id,product_title,qty,price_cents,cost_cents,discount_cents,total_cents,stock_deducted) values($1,$2,'x',1,${P},0,0,${P},1)`,[o.id,f.simple]);await db.exec(`update public.products set stock_qty=9 where id='${f.simple}'`)
 const r1=(await one(`select public.refund_online_order($1,'refunded') r`,[o.id])).r;const s1=await sp(f.simple)
 const r2=(await one(`select public.refund_online_order($1,'refunded') r`,[o.id])).r;const r3=(await one(`select public.refund_online_order($1,'cancelled') r`,[o.id])).r;const st=await one(`select status,payment_status from public.orders where id=$1`,[o.id])
 rec('B14','Tienda online','Reembolso desde Stripe/MercadoPago (solo cambia estado en el webhook)','Stock vuelve a 10 o queda alerta',`tras el reembolso ${s1} (devolvió ${r1}); webhook repetido y cancelar después: devolvió ${r2}/${r3}, stock ${await sp(f.simple)}; estado ${st.status}/${st.payment_status}`,s1==10&&r1===true&&r2===false&&r3===false&&await sp(f.simple)==10)
 const o2=await online(false);await q(`insert into public.order_items(order_id,product_id,product_title,qty,price_cents,cost_cents,discount_cents,total_cents) values($1,$2,'x',1,${P},0,0,${P})`,[o2.id,f.simple]);const r4=(await one(`select public.refund_online_order($1,'cancelled') r`,[o2.id])).r;const st2=await one(`select status,payment_status from public.orders where id=$1`,[o2.id])
 const o3=await online(true);await q(`insert into public.order_items(order_id,product_id,variant_id,product_talla,product_title,qty,price_cents,cost_cents,discount_cents,total_cents,stock_deducted) values($1,$2,$3,'L','x',1,${P},0,0,${P},1)`,[o3.id,f.talla,f.L]);await db.exec(`update public.product_variants set stock_qty=2 where id='${f.L}'; delete from public.product_variants where id='${f.L}'`);await q(`select public.refund_online_order($1,'cancelled')`,[o3.id])
 const l3=await one(`select stock_qty s from public.product_variants where product_id=$1 and talla='L'`,[f.talla]);let e=''; const pos=await sale([item(f.simple,null,1,P)],[pay('cash',f.a.cash,P)]);try{await q(`select public.refund_online_order($1,'cancelled')`,[pos.id])}catch(x){e=x.message}
 rec('B14b','Tienda online','Cancelar online sin pagar; cancelar pagada con la talla borrada; usarlo con una venta de mostrador','Sin pagar: stock igual; talla borrada: vuelve a crearse; mostrador: rechazado',`sin pagar: devolvió ${r4}, ${st2.status}/${st2.payment_status}, stock ${await sp(f.simple)}; talla L recreada con ${l3?.s}; mostrador: ${e||'aceptado'}`,r4===false&&st2.status=='cancelled'&&st2.payment_status=='pending'&&l3?.s==1&&e.includes('mostrador'))}


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
 { const g=await fx(); const c7=await sale([item(g.simple,null,1,P)],[pay('card',g.a.nu,P)]); await cancel(c7.id); try{ await edit(c7.id,[item(g.simple,null,1,P)],[pay('card',g.a.nu,P)]) }catch(e){ /* 00068: ya no se puede editar una venta cancelada */ }
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
