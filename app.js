import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const state = { page:'dashboard', profile:null, data:{orders:[],products:[],categories:[],customers:[],payments:[],reviews:[],events:[]}, dashboardPeriod:'today', filters:{orders:'',products:'',customers:'',reviews:'',payments:'',orderStatus:'',productAvailability:''} };
const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];

const esc = v => String(v ?? '').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money = v => `₱${Number(v||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const date = v => v ? new Date(v).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'}) : '—';
const shortDate = v => v ? new Date(v).toLocaleDateString('en-PH',{month:'short',day:'numeric'}) : '—';
const titleCase = v => String(v||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
function slugify(value,fallback='product'){return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||fallback}
async function uniqueProductSlug(name){const base=slugify(name);let candidate=base;let suffix=2;while(true){const {data,error}=await db.from('products').select('id').eq('slug',candidate).limit(1).maybeSingle();if(error)throw error;if(!data)return candidate;candidate=`${base}-${suffix++}`}}
async function uniqueCategorySlug(name){const base=slugify(name,'category');let candidate=base;let suffix=2;while(true){const {data,error}=await db.from('categories').select('id').eq('slug',candidate).limit(1).maybeSingle();if(error)throw error;if(!data)return candidate;candidate=`${base}-${suffix++}`}}
const badge = (v, cls=v) => `<span class="badge ${esc(cls)}">${esc(titleCase(v))}</span>`;
function toast(message,error=false){const el=document.createElement('div');el.className=`toast${error?' error':''}`;el.textContent=message;$('#toast-root').appendChild(el);setTimeout(()=>el.remove(),3200)}
function setConnection(ok){$('#connection-dot').style.background=ok?'#38c98a':'#d84b4b';$('#connection-label').textContent=ok?'Connected':'Offline / error'}
function fmtError(e){return e?.message||e?.error_description||'Something went wrong.'}

async function init(){
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('REPLACE_')){
    $('#login-error').textContent='Configure config.js with the same Supabase URL and anon/publishable key used by the customer app.';$('#login-error').classList.remove('hidden');return;
  }
  const {data:{session}}=await db.auth.getSession();
  if(session) await enterApp(); else showLogin();
  db.auth.onAuthStateChange(async (_event,session)=>{ if(session) await enterApp(); else showLogin(); });
}
function showLogin(){ $('#login-view').classList.remove('hidden'); $('#app-view').classList.add('hidden'); }
async function enterApp(){
  try{
    const user=(await db.auth.getUser()).data.user;
    const {data,error}=await db.from('profiles').select('*').eq('id',user.id).maybeSingle();
    if(error) throw error;
    if(!data || !['admin','staff'].includes(data.role)) { await db.auth.signOut(); throw new Error('This account is not assigned the admin or staff role. Update profiles.role in Supabase.'); }
    state.profile=data; $('#login-view').classList.add('hidden'); $('#app-view').classList.remove('hidden');
    $('#profile-name').textContent=data.full_name||user.email?.split('@')[0]||'Admin';$('#profile-role').textContent=data.role;$('#profile-avatar').textContent=(data.full_name||'A').trim().charAt(0).toUpperCase();
    await navigate(state.page||'dashboard');
  }catch(e){showLogin();$('#login-error').textContent=fmtError(e);$('#login-error').classList.remove('hidden');}
}

$('#login-form').addEventListener('submit',async e=>{e.preventDefault();const email=$('#login-email').value.trim(),password=$('#login-password').value;const btn=e.submitter;btn.disabled=true;btn.textContent='Signing in…';$('#login-error').classList.add('hidden');try{const {error}=await db.auth.signInWithPassword({email,password});if(error)throw error}catch(err){$('#login-error').textContent=fmtError(err);$('#login-error').classList.remove('hidden')}finally{btn.disabled=false;btn.textContent='Sign in'}});
$('#logout-btn').addEventListener('click',()=>db.auth.signOut());
$('#refresh-btn').addEventListener('click',()=>navigate(state.page,true));
$('#open-sidebar').addEventListener('click',()=>$('#sidebar').classList.add('open'));$('#close-sidebar').addEventListener('click',()=>$('#sidebar').classList.remove('open'));
$('#main-nav').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)navigate(b.dataset.page)});
document.addEventListener('click',e=>{const id=e.target.dataset.togglePassword;if(id){const input=document.getElementById(id);input.type=input.type==='password'?'text':'password';e.target.textContent=input.type==='password'?'Show':'Hide'}});

async function navigate(page,refresh=false){state.page=page;$$('.nav-item[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('#sidebar').classList.remove('open');const titles={dashboard:['Overview','Dashboard'],orders:['Operations','Orders'],products:['Catalog','Products'],categories:['Catalog','Categories'],customers:['People','Customers'],payments:['Finance','Payments'],reviews:['Content','Reviews'],settings:['System','Settings']};$('#page-kicker').textContent=titles[page]?.[0]||'TokaToka';$('#page-title').textContent=titles[page]?.[1]||'Dashboard';const content=$('#content');content.innerHTML='<div class="empty">Loading…</div>';try{if(page==='dashboard')await renderDashboard();if(page==='orders')await renderOrders(refresh);if(page==='products')await renderProducts(refresh);if(page==='categories')await renderCategories(refresh);if(page==='customers')await renderCustomers(refresh);if(page==='payments')await renderPayments(refresh);if(page==='reviews')await renderReviews(refresh);if(page==='settings')renderSettings()}catch(e){content.innerHTML=`<div class="card"><div class="empty"><strong>Could not load this section</strong>${esc(fmtError(e))}<br><button class="secondary-btn" style="margin-top:12px" onclick="location.reload()">Reload</button></div></div>`;setConnection(false);}}

async function fetchAll(){
  const [orders,products,categories,customers,payments,reviews]=await Promise.all([
    db.from('orders').select('*,profiles!orders_user_id_fkey(full_name,phone),addresses!orders_address_id_fkey(recipient_name,phone,address_line,city,province)').order('created_at',{ascending:false}),
    db.from('products').select('*,categories(name)').order('created_at',{ascending:false}),
    db.from('categories').select('*').order('sort_order').order('name'),
    db.from('profiles').select('*').order('created_at',{ascending:false}),
    db.from('payments').select('*,orders(order_number,user_id,profiles!orders_user_id_fkey(full_name),addresses!orders_address_id_fkey(recipient_name),order_items(product_name,quantity))').order('created_at',{ascending:false}),
    db.from('reviews').select('*,profiles(full_name),products(name)').order('created_at',{ascending:false})
  ]);
  for(const r of [orders,products,categories,customers,payments,reviews]) if(r.error) throw r.error;
  state.data={orders:orders.data||[],products:products.data||[],categories:categories.data||[],customers:customers.data||[],payments:payments.data||[],reviews:reviews.data||[]};setConnection(true);return state.data;
}
async function load(key,query){const {data,error}=await query;if(error)throw error;state.data[key]=data||[];setConnection(true);return state.data[key]}

function dashboardRangeStart(period,now=new Date()){
  const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(period==='last7')start.setDate(start.getDate()-6);
  if(period==='last30')start.setDate(start.getDate()-29);
  if(period==='month')start.setDate(1);
  if(period==='year')start.setMonth(0,1);
  if(period==='all')start.setTime(0);
  return start;
}
function localDateKey(date){
  const year=date.getFullYear();
  const month=String(date.getMonth()+1).padStart(2,'0');
  const day=String(date.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}
function ordersInDashboardRange(orders,period,now=new Date()){
  const start=dashboardRangeStart(period,now);
  return orders.filter(order=>{const created=new Date(order.created_at);return !Number.isNaN(created.valueOf())&&created>=start&&created<=now}).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
}
function eventDateTimeValue(value){if(!value)return '';const parsed=new Date(value);if(Number.isNaN(parsed.valueOf()))return '';return new Date(parsed.getTime()-parsed.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function eventForm(event={}){
  const editing=!!event.id;
  let imageUrl=event.image_url||null;
  let selectedFile=null;
  let previewUrl=null;
  openModal(editing?'Edit event':'Create event',`<form id="event-form" class="form-grid"><label>Title<input name="title" required maxlength="120" value="${esc(event.title||'')}" placeholder="Weekend special"></label><label>Discount (%)<input name="discount_percent" type="number" min="0" max="100" step="0.01" required value="${event.discount_percent??0}"></label><label class="full-span">Words / description<textarea name="description" maxlength="1000" placeholder="Describe the offer">${esc(event.description||'')}</textarea></label><label>Starts (optional)<input name="starts_at" type="datetime-local" value="${eventDateTimeValue(event.starts_at)}"></label><label>Ends (optional)<input name="ends_at" type="datetime-local" value="${eventDateTimeValue(event.ends_at)}"></label><div class="full-span"><span class="field-label">Event image</span><button type="button" class="image-picker" id="choose-event-image"><span class="image-picker-preview" id="event-image-preview">${imageUrl?`<img src="${esc(imageUrl)}" alt="Current event image">`:'<span class="image-placeholder">+</span>'}</span><span class="image-picker-copy"><b id="event-image-name">${imageUrl?'Change image':'Choose an image'}</b><span>JPG, PNG or WebP, up to 5 MB</span></span></button><input id="event-image-file" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" hidden></div><label class="checkbox full-span"><input name="is_active" type="checkbox" ${event.is_active!==false?'checked':''}> Active</label></form>`,`<button class="secondary-btn" data-close-modal>Cancel</button><button class="primary-btn" id="save-event">${editing?'Save changes':'Create event'}</button>`);
  const selectedProductIds=new Set((event.event_products||[]).map(link=>link.product_id));
  const productPicker=`<div class="full-span event-product-selection"><div class="event-product-selection-head"><span class="field-label">Products receiving this discount</span><span id="event-product-count">${selectedProductIds.size} selected</span></div><label class="event-product-select-all"><input id="select-all-event-products" type="checkbox"><span>Select all products</span></label><input id="event-product-search" type="search" placeholder="Search products"><div class="event-product-options" id="event-product-options">${state.data.products.map(product=>{const searchText=`${product.name} ${product.categories?.name||''}`.toLowerCase();return `<label class="event-product-option" data-product-search="${esc(searchText)}"><input type="checkbox" name="event_product_ids" value="${esc(product.id)}" ${selectedProductIds.has(product.id)?'checked':''}><span><b>${esc(product.name)}</b><small>${esc(product.categories?.name||'Uncategorized')} · ${money(product.price)}</small></span></label>`}).join('')||'<div class="empty compact-empty">No products available.</div>'}</div></div>`;
  $('#event-image-file').parentElement.insertAdjacentHTML('beforebegin',productPicker);
  const productOptions=$$('#event-product-options .event-product-option');
  const productInputs=productOptions.map(option=>option.querySelector('input'));
  const selectAllProducts=$('#select-all-event-products');
  const updateProductCount=()=>{
    const selectedCount=productInputs.filter(input=>input.checked).length;
    $('#event-product-count').textContent=`${selectedCount} selected`;
    selectAllProducts.checked=productInputs.length>0&&selectedCount===productInputs.length;
    selectAllProducts.indeterminate=selectedCount>0&&selectedCount<productInputs.length;
  };
  selectAllProducts.onchange=()=>{
    productInputs.forEach(input=>input.checked=selectAllProducts.checked);
    updateProductCount();
  };
  productInputs.forEach(input=>input.onchange=updateProductCount);
  updateProductCount();
  $('#event-product-search').oninput=event=>{const query=event.target.value.trim().toLowerCase();productOptions.forEach(option=>{option.hidden=!option.dataset.productSearch.includes(query)})};
  const fileInput=$('#event-image-file');
  $('#choose-event-image').onclick=()=>fileInput.click();
  fileInput.onchange=()=>{
    const file=fileInput.files?.[0];
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){toast('Choose a JPG, PNG, or WebP image under 5 MB.',true);fileInput.value='';return}
    selectedFile=file;
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    previewUrl=URL.createObjectURL(file);
    $('#event-image-preview').innerHTML=`<img src="${previewUrl}" alt="Selected event image">`;
    $('#event-image-name').textContent=file.name;
  };
  $('#save-event').onclick=async()=>{
    const form=$('#event-form');
    if(!form.reportValidity())return;
    const fd=new FormData(form);
    const targetProductIds=fd.getAll('event_product_ids').map(String);
    if(!targetProductIds.length){toast('Select at least one product for this discount.',true);return}
    const startsAt=fd.get('starts_at')?new Date(fd.get('starts_at')):null;
    const endsAt=fd.get('ends_at')?new Date(fd.get('ends_at')):null;
    if(startsAt&&endsAt&&endsAt<=startsAt){toast('The end time must be after the start time.',true);return}
    const payload={title:fd.get('title').trim(),description:fd.get('description')?.trim()||'',discount_percent:Number(fd.get('discount_percent')),image_url:imageUrl,starts_at:startsAt?.toISOString()||null,ends_at:endsAt?.toISOString()||null,is_active:fd.get('is_active')==='on',updated_at:new Date().toISOString()};
    const saveButton=$('#save-event');
    let uploadedPath=null;
    saveButton.disabled=true;
    saveButton.textContent=selectedFile?'Uploading image…':'Saving…';
    try{
      if(selectedFile){
        const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[selectedFile.type];
        uploadedPath=`events/${crypto.randomUUID()}.${extension}`;
        const {error}=await db.storage.from('event-images').upload(uploadedPath,selectedFile,{cacheControl:'3600',contentType:selectedFile.type});
        if(error)throw error;
        imageUrl=db.storage.from('event-images').getPublicUrl(uploadedPath).data.publicUrl;
        payload.image_url=imageUrl;
      }
      let savedEventId=event.id;
      const result=editing
        ? await db.from('events').update(payload).eq('id',event.id)
        : await db.from('events').insert(payload).select('id').single();
      if(result.error)throw result.error;
      if(!editing)savedEventId=result.data?.id;
      if(!savedEventId)throw new Error('Could not identify the saved event.');
      const {error:targetError}=await db.rpc('set_event_products',{p_event_id:savedEventId,p_product_ids:targetProductIds});
      if(targetError)throw targetError;
      let pushFailed=false;
      let pushSent=0;
      if(!editing&&payload.is_active){
        try{
          const {data:pushData,error:pushError}=await db.functions.invoke('send-event-notification',{body:{event_id:savedEventId}});
          if(pushError){console.error('Event was created but push notification failed:',pushError);pushFailed=true}
          else pushSent=Number(pushData?.sent||0);
        }catch(pushError){console.error('Event was created but push notification failed:',pushError);pushFailed=true}
      }
      if(previewUrl)URL.revokeObjectURL(previewUrl);
      closeModal();
      toast(editing?'Event updated':pushFailed?'Event created, but push could not be sent.':pushSent>0?`Event created; notification sent to ${pushSent} device${pushSent===1?'':'s'}.`:'Event created; no opted-in devices to notify.');
      await renderDashboard();
    }catch(error){
      if(uploadedPath)await db.storage.from('event-images').remove([uploadedPath]);
      saveButton.disabled=false;
      saveButton.textContent=editing?'Save changes':'Create event';
      toast(fmtError(error),true);
    }
  };
}

async function setEventActive(id,isActive){try{const {error}=await db.from('events').update({is_active:isActive,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;toast(isActive?'Event activated':'Event paused');await renderDashboard()}catch(error){toast(fmtError(error),true)}}
async function deleteEvent(id){const event=state.data.events.find(item=>item.id===id);if(!event||!confirm(`Delete event “${event.title}”?`))return;try{const {error}=await db.from('events').delete().eq('id',id);if(error)throw error;toast('Event deleted');await renderDashboard()}catch(error){toast(fmtError(error),true)}}

async function renderDashboardReports(data){
  const now=new Date();
  const periods=[['today','Today'],['last7','Last 7 days'],['last30','Last 30 days'],['month','This month'],['year','This year'],['all','All time']];
  const customers=data.customers.filter(user=>user.role==='customer').sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,10);
  const ranges=periods.slice(0,5).map(([key,label])=>{const orders=ordersInDashboardRange(data.orders,key,now);return {key,label,count:orders.length,value:orders.reduce((sum,order)=>sum+Number(order.total_amount||0),0)}});
  let events=[];let eventsError=null;
  const eventResult=await db.from('events').select('*,event_products(product_id)').order('created_at',{ascending:false}).limit(8);
  if(eventResult.error)eventsError=eventResult.error.message;else{events=eventResult.data||[];state.data.events=events}
  $('#content').insertAdjacentHTML('beforeend',`<section class="card dashboard-report"><div class="card-pad"><div class="card-title"><div><h3>Order reports</h3><span>Filter order records by date range</span></div><span id="dashboard-order-count"></span></div><div class="dashboard-range-summary">${ranges.map(range=>`<div><span>${range.label}</span><b>${range.count} orders</b><small>${money(range.value)}</small></div>`).join('')}</div><div class="toolbar"><select id="dashboard-period" aria-label="Order report period">${periods.map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></div><div class="table-wrap"><table class="table dashboard-report-table"><thead><tr><th>Placed</th><th>Order</th><th>Customer</th><th>Status</th><th>Payment</th><th>Total</th></tr></thead><tbody id="dashboard-orders-body"></tbody></table></div></div></section><div class="grid two-col dashboard-extra-grid"><section class="card"><div class="card-pad"><div class="card-title"><div><h3>Recent customers</h3><span>Latest registered accounts</span></div><button class="secondary-btn small-btn" onclick="window.__nav('customers')">View all</button></div><div class="table-wrap"><table class="table dashboard-users-table"><thead><tr><th>Customer</th><th>Phone</th><th>Joined</th></tr></thead><tbody>${customers.length?customers.map(user=>`<tr><td><b>${esc(user.full_name||'Unnamed user')}</b></td><td>${esc(user.phone||'—')}</td><td>${shortDate(user.created_at)}</td></tr>`).join(''):'<tr><td colspan="3"><div class="empty">No customers yet.</div></td></tr>'}</tbody></table></div></div></section><section class="card"><div class="card-pad"><div class="card-title"><div><h3>Events &amp; offers</h3><span>Promotional content</span></div><button class="primary-btn small-btn" id="new-dashboard-event">+ Create event</button></div><div id="dashboard-events">${eventsError?`<div class="notice">Events are not available. Run <b>admin-dashboard.sql</b> in Supabase. ${esc(eventsError)}</div>`:events.length?`<div class="event-list">${events.map(event=>`<div class="event-row"><div class="event-image">${event.image_url?`<img src="${esc(event.image_url)}" alt="">`:'<span>Event</span>'}</div><div class="event-copy"><b>${esc(event.title)}</b><span>${Number(event.discount_percent||0)}% discount · ${event.is_active?'Active':'Inactive'}</span><small>${esc(event.description||'')}</small></div><div class="event-actions"><button class="secondary-btn small-btn" data-event-edit="${esc(event.id)}">Edit</button><button class="secondary-btn small-btn" data-event-toggle="${esc(event.id)}" data-active="${event.is_active?'true':'false'}">${event.is_active?'Pause':'Activate'}</button><button class="danger-btn small-btn" data-event-delete="${esc(event.id)}">Delete</button></div></div>`).join('')}</div>`:'<div class="empty compact-empty">No events yet.</div>'}</div></div></section></div>`);
  const reportToolbar=$('.dashboard-report .toolbar');
  reportToolbar.classList.add('dashboard-report-toolbar');
  $('.dashboard-range-summary')?.remove();
  reportToolbar.insertAdjacentHTML('beforeend','<div class="dashboard-range-total"><span>Successful sales</span><strong id="dashboard-successful-sales">₱0.00</strong><small id="dashboard-successful-count">0 paid orders</small></div>');
  const drawOrderRows=period=>{const orders=ordersInDashboardRange(data.orders,period,now);const successful=orders.filter(order=>order.payment_status==='paid'&&order.status!=='cancelled');$('#dashboard-order-count').textContent=`${orders.length} orders`;$('#dashboard-successful-sales').textContent=money(successful.reduce((sum,order)=>sum+Number(order.total_amount||0),0));$('#dashboard-successful-count').textContent=`${successful.length} paid orders`;$('#dashboard-orders-body').innerHTML=orders.length?orders.slice(0,50).map(order=>`<tr><td>${date(order.created_at)}</td><td><b>${esc(order.order_number||'—')}</b></td><td>${esc(order.profiles?.full_name||'Customer')}</td><td>${badge(order.status)}</td><td>${badge(order.payment_status,order.payment_status)}</td><td><b>${money(order.total_amount)}</b></td></tr>`).join(''):'<tr><td colspan="6"><div class="empty">No orders in this period.</div></td></tr>'};
  $('#dashboard-period').value=state.dashboardPeriod;
  $('#dashboard-period').onchange=event=>{state.dashboardPeriod=event.target.value;drawOrderRows(state.dashboardPeriod)};
  drawOrderRows(state.dashboardPeriod);
  $('#new-dashboard-event').onclick=()=>eventForm();
  $$('[data-event-edit]').forEach(button=>button.onclick=()=>eventForm(events.find(event=>event.id===button.dataset.eventEdit)));
  $$('[data-event-toggle]').forEach(button=>button.onclick=()=>setEventActive(button.dataset.eventToggle,button.dataset.active!=='true'));
  $$('[data-event-delete]').forEach(button=>button.onclick=()=>deleteEvent(button.dataset.eventDelete));
}

async function renderDashboard(){const d=await fetchAll();const total=d.orders.reduce((s,o)=>s+Number(o.total_amount||0),0);const paid=d.orders.filter(o=>o.payment_status==='paid').reduce((s,o)=>s+Number(o.total_amount||0),0);const active=d.orders.filter(o=>!['delivered','cancelled'].includes(o.status)).length;const low=d.products.filter(p=>Number(p.stock_quantity)<=5).length;const counts={pending:0,confirmed:0,preparing:0,on_transit:0,delivered:0,cancelled:0};d.orders.forEach(o=>{if(counts[o.status]!=null)counts[o.status]++});
  const recent=d.orders.slice(0,7);const max=Math.max(...Object.values(counts),1);const today=new Date();today.setHours(0,0,0,0);const weekDays=Array.from({length:7},(_,index)=>{const day=new Date(today);day.setDate(today.getDate()-6+index);return {key:localDateKey(day),label:day.toLocaleDateString('en-US',{weekday:'short'})}});const labels=weekDays.map(day=>day.label);const weekCounts=new Map(weekDays.map(day=>[day.key,0]));d.orders.forEach(order=>{const created=new Date(order.created_at);if(Number.isNaN(created.valueOf()))return;const key=localDateKey(created);if(weekCounts.has(key))weekCounts.set(key,weekCounts.get(key)+1)});const week=weekDays.map(day=>weekCounts.get(day.key));const maxWeek=Math.max(...week,1);
  $('#content').innerHTML=`<div class="page-head"><div><h1>Good day, ${esc((state.profile.full_name||'Admin').split(' ')[0])}.</h1><p>Here is what's happening across TokaToka today.</p></div><div class="page-actions"><button class="secondary-btn" id="export-orders">Export orders CSV</button><button class="primary-btn" onclick="window.__newProduct()">+ Add product</button></div></div>
  <div class="grid metrics"><div class="metric"><div class="metric-head"><span>Total orders</span><div class="metric-icon">▣</div></div><div class="metric-value">${d.orders.length}</div><div class="metric-foot">${active} active right now</div></div><div class="metric"><div class="metric-head"><span>Order value</span><div class="metric-icon">₱</div></div><div class="metric-value">${money(total)}</div><div class="metric-foot">${money(paid)} marked paid</div></div><div class="metric"><div class="metric-head"><span>Customers</span><div class="metric-icon">◎</div></div><div class="metric-value">${d.customers.filter(x=>x.role==='customer').length}</div><div class="metric-foot">${d.customers.filter(x=>x.role!=='customer').length} staff/admin accounts</div></div><div class="metric"><div class="metric-head"><span>Low stock</span><div class="metric-icon">!</div></div><div class="metric-value">${low}</div><div class="metric-foot">Products with 5 or fewer units</div></div></div>
  <div class="grid two-col"><section class="card"><div class="card-pad"><div class="card-title"><h3>Orders — last 7 days</h3><span>${d.orders.length} total</span></div><div class="chart">${week.map((n,i)=>`<div class="bar-wrap"><span class="bar-value">${n}</span><div class="bar" style="height:${Math.max(4,n/maxWeek*150)}px"></div><span class="bar-label">${labels[i]}</span></div>`).join('')}</div></div></section><section class="card"><div class="card-pad"><div class="card-title"><h3>Order status</h3><span>Current records</span></div><div class="status-list">${Object.entries(counts).map(([k,n])=>`<div class="status-line"><i class="dot ${k}"></i><span>${titleCase(k)}</span><b>${n}</b></div>`).join('')}</div></div></section></div>
  <div class="grid two-col" style="margin-top:16px"><section class="card"><div class="card-pad"><div class="card-title"><h3>Recent orders</h3><button class="secondary-btn small-btn" onclick="window.__nav('orders')">View all</button></div><div class="list">${recent.length?recent.map(o=>`<div class="list-row"><div class="avatar">${esc((o.profiles?.full_name||'C').charAt(0).toUpperCase())}</div><div class="list-main"><b>${esc(o.order_number)}</b><span>${esc(o.profiles?.full_name||'Customer')} · ${date(o.created_at)}</span></div>${badge(o.status)}<span class="amount">${money(o.total_amount)}</span></div>`).join(''):`<div class="empty">No orders yet.</div>`}</div></div></section><section class="card"><div class="card-pad"><div class="card-title"><h3>Top products by reviews</h3><button class="secondary-btn small-btn" onclick="window.__nav('products')">Manage</button></div><div class="list">${[...d.products].sort((a,b)=>Number(b.average_rating||0)-Number(a.average_rating||0)).slice(0,5).map(p=>`<div class="list-row"><div class="product-thumb placeholder">◈</div><div class="list-main"><b>${esc(p.name)}</b><span>${esc(p.categories?.name||'Uncategorized')} · ${p.review_count||0} reviews</span></div><span class="amount">★ ${Number(p.average_rating||0).toFixed(1)}</span></div>`).join('')||'<div class="empty">No products yet.</div>'}</div></div></section></div>`;
  $('#export-orders').onclick=()=>exportCSV(d.orders,'tokatoka-orders.csv',['order_number','status','payment_status','payment_method','subtotal','delivery_fee','discount','total_amount','created_at']);
  await renderDashboardReports(d);
}

async function renderOrders(refresh=false){if(refresh||!state.data.orders.length)await load('orders',db.from('orders').select('*,profiles!orders_user_id_fkey(full_name,phone),addresses!orders_address_id_fkey(recipient_name,phone,address_line,city,province)').order('created_at',{ascending:false}));const all=state.data.orders;const q=state.filters.orders.toLowerCase();const filtered=all.filter(o=>(!state.filters.orderStatus||o.status===state.filters.orderStatus)&&(`${o.order_number} ${o.profiles?.full_name||''} ${o.payment_method||''}`.toLowerCase().includes(q)));$('#content').innerHTML=`<div class="page-head"><div><h1>Orders</h1><p>Review incoming orders and move them through the TokaToka workflow.</p></div><div class="page-actions"><button class="secondary-btn" id="orders-export">Export CSV</button></div></div><div class="card"><div class="card-pad"><div class="toolbar"><div class="search"><span>⌕</span><input id="order-search" placeholder="Search order number or customer" value="${esc(state.filters.orders)}"></div><select id="order-status-filter"><option value="">All statuses</option>${['pending','confirmed','preparing','on_transit','delivered','cancelled'].map(x=>`<option value="${x}" ${state.filters.orderStatus===x?'selected':''}>${titleCase(x)}</option>`).join('')}</select></div><div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Payment</th><th>Total</th><th>Placed</th><th></th></tr></thead><tbody>${filtered.length?filtered.map(o=>`<tr><td><b>${esc(o.order_number)}</b><div class="muted-small">${esc(o.payment_method||'—')}</div></td><td>${esc(o.profiles?.full_name||'Customer')}<div class="muted-small">${esc(o.profiles?.phone||'')}</div></td><td>${badge(o.status)}</td><td>${badge(o.payment_status,o.payment_status)}</td><td><b>${money(o.total_amount)}</b></td><td>${shortDate(o.created_at)}</td><td><button class="secondary-btn small-btn" onclick="window.__order('${o.id}')">View</button></td></tr>`).join(''):`<tr><td colspan="7"><div class="empty"><strong>No matching orders</strong>Orders from the customer app will appear here once created.</div></td></tr>`}</tbody></table></div></div></div>`;$('#order-search').oninput=e=>{state.filters.orders=e.target.value;renderOrders()};$('#order-status-filter').onchange=e=>{state.filters.orderStatus=e.target.value;renderOrders()};$('#orders-export').onclick=()=>exportCSV(filtered,'tokatoka-orders.csv',['order_number','status','payment_status','payment_method','subtotal','delivery_fee','discount','total_amount','created_at']);}

async function orderDetail(id){const o=state.data.orders.find(x=>x.id===id);if(!o)return;const {data:items,error}=await db.from('order_items').select('*').eq('order_id',id).order('product_name');if(error)throw error;openModal(`Order ${o.order_number}`,`<div class="detail-grid"><div class="detail-item"><span>Customer</span><b>${esc(o.profiles?.full_name||'Customer')}</b></div><div class="detail-item"><span>Placed</span><b>${date(o.created_at)}</b></div><div class="detail-item"><span>Payment</span><b>${badge(o.payment_status,o.payment_status)} ${esc(o.payment_method||'')}</b></div><div class="detail-item"><span>Total</span><b>${money(o.total_amount)}</b></div></div><div style="height:14px"></div><label>Order status<select id="modal-order-status">${['pending','confirmed','preparing','on_transit','delivered','cancelled'].map(x=>`<option value="${x}" ${o.status===x?'selected':''}>${titleCase(x)}</option>`).join('')}</select></label><div style="height:14px"></div><div class="order-summary"><b style="font-size:12px">Items</b>${items?.length?items.map(i=>`<div class="item-line"><div class="grow"><b style="font-size:12px">${esc(i.product_name)}</b><div class="muted-small">${i.quantity} × ${money(i.unit_price)}</div></div><b>${money(i.subtotal)}</b></div>`).join(''):'<div class="muted-small" style="padding-top:10px">No order items stored.</div>'}</div>${o.addresses?`<div style="height:14px"></div><div class="order-summary"><b style="font-size:12px">Delivery address</b><div class="muted-small" style="margin-top:7px">${esc(o.addresses.recipient_name||o.profiles?.full_name||'')} · ${esc(o.addresses.phone||'')}<br>${esc(o.addresses.address_line||'')}, ${esc(o.addresses.city||'')}, ${esc(o.addresses.province||'')}</div></div>`:''}${o.notes?`<div style="height:14px"></div><div class="notice"><b>Customer note:</b> ${esc(o.notes)}</div>`:''}`,`<button class="secondary-btn" data-close-modal>Close</button><button class="primary-btn" id="save-order-status">Save status</button>`);$('#save-order-status').onclick=async()=>{const status=$('#modal-order-status').value;try{const {error}=await db.from('orders').update({status,updated_at:new Date().toISOString(),...(status==='delivered'?{delivered_at:new Date().toISOString()}: {})}).eq('id',id);if(error)throw error;closeModal();toast('Order status updated');await renderOrders(true)}catch(e){toast(fmtError(e),true)}}}

async function renderProducts(refresh=false){if(refresh||!state.data.products.length)await load('products',db.from('products').select('*,categories(name)').order('created_at',{ascending:false}));if(!state.data.categories.length)await load('categories',db.from('categories').select('*').order('sort_order').order('name'));const q=state.filters.products.toLowerCase();const filtered=state.data.products.filter(p=>(!state.filters.productAvailability||String(p.is_available)===state.filters.productAvailability)&&`${p.name} ${p.description} ${p.categories?.name||''}`.toLowerCase().includes(q));$('#content').innerHTML=`<div class="page-head"><div><h1>Products</h1><p>Manage menu items, pricing, stock, availability, and preparation time.</p></div><button class="primary-btn" onclick="window.__newProduct()">+ Add product</button></div><div class="card"><div class="card-pad"><div class="toolbar"><div class="search"><span>⌕</span><input id="product-search" placeholder="Search products" value="${esc(state.filters.products)}"></div><select id="product-availability"><option value="">All availability</option><option value="true" ${state.filters.productAvailability==='true'?'selected':''}>Available</option><option value="false" ${state.filters.productAvailability==='false'?'selected':''}>Unavailable</option></select></div><div class="table-wrap"><table class="table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Rating</th><th>Availability</th><th></th></tr></thead><tbody>${filtered.length?filtered.map(p=>`<tr><td><div class="product-cell">${p.image_url?`<img class="product-thumb" src="${esc(p.image_url)}" onerror="this.style.display='none'">`:'<div class="product-thumb placeholder">◈</div>'}<div><b>${esc(p.name)}</b><span>${esc(p.description||'')}</span></div></div></td><td>${esc(p.categories?.name||'Uncategorized')}</td><td><b>${money(p.price)}</b></td><td>${Number(p.stock_quantity)}${Number(p.stock_quantity)<=5?` <span class="badge pending">Low</span>`:''}</td><td><span class="rating">★</span> ${Number(p.average_rating||0).toFixed(1)} <span class="muted-small">(${p.review_count||0})</span></td><td>${badge(p.is_available?'available':'unavailable',p.is_available?'active':'inactive')}</td><td><div class="action-row"><button class="secondary-btn small-btn" onclick="window.__editProduct('${p.id}')">Edit</button><button class="danger-btn small-btn" onclick="window.__deleteProduct('${p.id}')">Delete</button></div></td></tr>`).join(''):`<tr><td colspan="7"><div class="empty"><strong>No products found</strong>Try another search or add your first product.</div></td></tr>`}</tbody></table></div></div></div>`;$('#product-search').oninput=e=>{state.filters.products=e.target.value;renderProducts()};$('#product-availability').onchange=e=>{state.filters.productAvailability=e.target.value;renderProducts()}}

function productForm(p={}){
  const isEdit=!!p.id;
  let imageUrl=p.image_url||null;
  let selectedFile=null;
  let previewUrl=null;
  openModal(isEdit?'Edit product':'Add product',`<form id="product-form" class="form-grid"><label>Name<input name="name" required value="${esc(p.name||'')}" placeholder="e.g. Sinigang"></label><label>Category<select name="category_id"><option value="">Uncategorized</option>${state.data.categories.map(c=>`<option value="${c.id}" ${p.category_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>Price<input name="price" type="number" min="0" step="0.01" required value="${p.price??''}"></label><label>Stock quantity<input name="stock_quantity" type="number" min="0" step="1" required value="${p.stock_quantity??0}"></label><label>Preparation time (minutes)<input name="preparation_time" type="number" min="0" step="1" value="${p.preparation_time??15}"></label><label>Serving size<input name="serving_size" value="${esc(p.serving_size||'')}" placeholder="Good for 1"></label><div class="full-span"><span class="field-label">Product photo</span><button type="button" class="image-picker" id="choose-product-image"><span class="image-picker-preview" id="product-image-preview">${imageUrl?`<img src="${esc(imageUrl)}" alt="Current product photo">`:'<span class="image-placeholder">+</span>'}</span><span class="image-picker-copy"><b id="product-image-name">${imageUrl?'Change photo':'Choose a photo'}</b><span>JPG, PNG or WebP, up to 5 MB</span></span></button><input id="product-image-file" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" hidden></div><label class="full-span">Description<textarea name="description" placeholder="Describe the food item">${esc(p.description||'')}</textarea></label><label class="checkbox full-span"><input name="is_available" type="checkbox" ${p.is_available!==false?'checked':''}> Available for customers</label></form>`,`<button class="secondary-btn" data-close-modal>Cancel</button><button class="primary-btn" id="save-product">${isEdit?'Save changes':'Create product'}</button>`);
  const fileInput=$('#product-image-file');
  $('#choose-product-image').onclick=()=>fileInput.click();
  fileInput.onchange=()=>{
    const file=fileInput.files?.[0];
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){toast('Choose a JPG, PNG, or WebP photo under 5 MB.',true);fileInput.value='';return}
    selectedFile=file;
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    previewUrl=URL.createObjectURL(file);
    $('#product-image-preview').innerHTML=`<img src="${previewUrl}" alt="Selected product photo">`;
    $('#product-image-name').textContent=file.name;
  };
  $('#save-product').onclick=async()=>{
    const form=$('#product-form');
    if(!form.reportValidity())return;
    const fd=new FormData(form);
    const payload={name:fd.get('name').trim(),category_id:fd.get('category_id')||null,price:Number(fd.get('price')),stock_quantity:Number(fd.get('stock_quantity')),preparation_time:Number(fd.get('preparation_time')||15),serving_size:fd.get('serving_size')?.trim()||null,image_url:imageUrl,description:fd.get('description')?.trim()||'',is_available:fd.get('is_available')==='on',updated_at:new Date().toISOString()};
    const saveButton=$('#save-product');
    let uploadedPath=null;
    saveButton.disabled=true;
    saveButton.textContent=selectedFile?'Uploading photo…':'Saving…';
    try{
      if(!isEdit)payload.slug=await uniqueProductSlug(payload.name);
      if(selectedFile){
        const extension={ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' }[selectedFile.type];
        uploadedPath=`products/${crypto.randomUUID()}.${extension}`;
        const {error}=await db.storage.from('product-images').upload(uploadedPath,selectedFile,{cacheControl:'3600',contentType:selectedFile.type});
        if(error)throw error;
        imageUrl=db.storage.from('product-images').getPublicUrl(uploadedPath).data.publicUrl;
        payload.image_url=imageUrl;
      }
      const result=isEdit?await db.from('products').update(payload).eq('id',p.id):await db.from('products').insert(payload);
      if(result.error)throw result.error;
      if(previewUrl)URL.revokeObjectURL(previewUrl);
      closeModal();
      toast(isEdit?'Product updated':'Product created');
      await renderProducts(true);
    }catch(e){
      if(uploadedPath)await db.storage.from('product-images').remove([uploadedPath]);
      saveButton.disabled=false;
      saveButton.textContent=isEdit?'Save changes':'Create product';
      toast(fmtError(e),true);
    }
  };
}
async function deleteProduct(id){const p=state.data.products.find(x=>x.id===id);if(!p||!confirm(`Delete “${p.name}”? Reviews and order references may be affected by the database's foreign-key rules.`))return;try{const {error}=await db.from('products').delete().eq('id',id);if(error)throw error;toast('Product deleted');await renderProducts(true)}catch(e){toast(fmtError(e),true)}}

async function renderCategories(refresh=false){if(refresh||!state.data.categories.length)await load('categories',db.from('categories').select('*').order('sort_order').order('name'));$('#content').innerHTML=`<div class="page-head"><div><h1>Categories</h1><p>Organize the menu categories shown in the customer app.</p></div><button class="primary-btn" onclick="window.__newCategory()">+ Add category</button></div><div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Description</th><th>Sort order</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>${state.data.categories.length?state.data.categories.map(c=>`<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.description||'—')}</td><td>${c.sort_order??0}</td><td>${badge(c.is_active?'active':'inactive',c.is_active?'active':'inactive')}</td><td>${shortDate(c.created_at)}</td><td><div class="action-row"><button class="secondary-btn small-btn" onclick="window.__editCategory('${c.id}')">Edit</button><button class="danger-btn small-btn" onclick="window.__deleteCategory('${c.id}')">Delete</button></div></td></tr>`).join(''):`<tr><td colspan="6"><div class="empty">No categories yet.</div></td></tr>`}</tbody></table></div></div>`}
function categoryForm(c={}){
  const edit=!!c.id;
  openModal(edit?'Edit category':'Add category',`<form id="category-form" class="form-grid"><label>Name<input name="name" required value="${esc(c.name||'')}" placeholder="Main Dishes"></label><label>Sort order<input name="sort_order" type="number" step="1" value="${c.sort_order??0}"></label><label class="full-span">Description<textarea name="description" placeholder="Optional category description">${esc(c.description||'')}</textarea></label><label class="checkbox full-span"><input name="is_active" type="checkbox" ${c.is_active!==false?'checked':''}> Active</label></form>`,`<button class="secondary-btn" data-close-modal>Cancel</button><button class="primary-btn" id="save-category">${edit?'Save changes':'Create category'}</button>`);
  $('#save-category').onclick=async()=>{
    const form=$('#category-form');
    if(!form.reportValidity())return;
    const fd=new FormData(form);
    const payload={name:fd.get('name').trim(),sort_order:Number(fd.get('sort_order')||0),description:fd.get('description')?.trim()||null,is_active:fd.get('is_active')==='on'};
    try{
      if(!edit)payload.slug=await uniqueCategorySlug(payload.name);
      const result=edit?await db.from('categories').update(payload).eq('id',c.id):await db.from('categories').insert(payload);
      if(result.error)throw result.error;
      closeModal();
      toast(edit?'Category updated':'Category created');
      await renderCategories(true);
    }catch(error){toast(fmtError(error),true)}
  };
}
async function deleteCategory(id){const c=state.data.categories.find(x=>x.id===id);if(!c||!confirm(`Delete “${c.name}”? Products will keep their records but lose this category.`))return;try{const {error}=await db.from('categories').delete().eq('id',id);if(error)throw error;toast('Category deleted');await renderCategories(true)}catch(e){toast(fmtError(e),true)}}

async function renderCustomers(refresh=false){if(refresh||!state.data.customers.length)await load('customers',db.from('profiles').select('*').order('created_at',{ascending:false}));const q=state.filters.customers.toLowerCase();const filtered=state.data.customers.filter(c=>`${c.full_name||''} ${c.phone||''} ${c.role||''}`.toLowerCase().includes(q));$('#content').innerHTML=`<div class="page-head"><div><h1>Customers</h1><p>View registered TokaToka accounts and their assigned roles.</p></div></div><div class="card"><div class="card-pad"><div class="toolbar"><div class="search"><span>⌕</span><input id="customer-search" placeholder="Search name, phone, or role" value="${esc(state.filters.customers)}"></div></div><div class="table-wrap"><table class="table"><thead><tr><th>User</th><th>Phone</th><th>Role</th><th>Theme</th><th>Joined</th></tr></thead><tbody>${filtered.length?filtered.map(c=>`<tr><td><div class="product-cell"><div class="avatar">${esc((c.full_name||'U').charAt(0).toUpperCase())}</div><div><b>${esc(c.full_name||'Unnamed user')}</b><span>${esc(c.id)}</span></div></div></td><td>${esc(c.phone||'—')}</td><td>${badge(c.role,c.role)}</td><td>${esc(c.theme||'system')}</td><td>${date(c.created_at)}</td></tr>`).join(''):`<tr><td colspan="5"><div class="empty">No users found.</div></td></tr>`}</tbody></table></div></div></div>`;$('#customer-search').oninput=e=>{state.filters.customers=e.target.value;renderCustomers()}}

async function renderPayments(refresh=false){
  if(refresh||!state.data.payments.length)await load('payments',db.from('payments').select('*,orders(order_number,user_id,profiles!orders_user_id_fkey(full_name),addresses!orders_address_id_fkey(recipient_name),order_items(product_name,quantity))').order('created_at',{ascending:false}));
  const q=state.filters.payments.toLowerCase();
  const filtered=state.data.payments.filter(p=>`${p.paymongo_payment_id||''} ${p.paymongo_checkout_id||''} ${p.orders?.order_number||''} ${p.orders?.profiles?.full_name||''} ${(p.orders?.order_items||[]).map(item=>item.product_name||'').join(' ')}`.toLowerCase().includes(q));
  $('#content').innerHTML=`<div class="page-head"><div><h1>Payments</h1><p>Monitor PayMongo and other payment records linked to orders.</p></div></div><div class="card"><div class="card-pad"><div class="toolbar"><div class="search"><span>⌕</span><input id="payment-search" placeholder="Search order, customer, product, or payment ID" value="${esc(state.filters.payments)}"></div><button class="secondary-btn" id="payment-export">Export CSV</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Customer</th><th>Products</th><th>Method</th><th>Status</th><th>Amount</th><th>Payment ID</th><th>Date</th></tr></thead><tbody>${filtered.length?filtered.map(p=>{const products=(p.orders?.order_items||[]).map(item=>`${item.product_name||'Product'} ×${item.quantity||1}`).join(', ')||'—';const customerName=p.orders?.profiles?.full_name||p.orders?.addresses?.recipient_name||'—';return `<tr><td><b>${esc(p.orders?.order_number||'—')}</b></td><td>${esc(customerName)}</td><td>${esc(products)}</td><td>${esc(p.method||'—')}</td><td>${badge(p.status,p.status)}</td><td><b>${money(p.amount)}</b></td><td class="muted-small">${esc(p.paymongo_payment_id||p.paymongo_checkout_id||'—')}</td><td>${shortDate(p.created_at)}</td></tr>`}).join(''):`<tr><td colspan="8"><div class="empty"><strong>No payment records</strong>Payment rows will appear here after checkout integration stores them.</div></td></tr>`}</tbody></table></div></div></div>`;
  $('#payment-search').oninput=e=>{state.filters.payments=e.target.value;renderPayments()};
  $('#payment-export').onclick=()=>exportCSV(filtered,'tokatoka-payments.csv',['order_id','paymongo_payment_id','paymongo_checkout_id','status','method','amount','paid_at','created_at']);
}

async function renderReviews(refresh=false){if(refresh||!state.data.reviews.length)await load('reviews',db.from('reviews').select('*,profiles(full_name),products(name)').order('created_at',{ascending:false}));const q=state.filters.reviews.toLowerCase();const filtered=state.data.reviews.filter(r=>`${r.comment||''} ${r.products?.name||''} ${r.profiles?.full_name||''}`.toLowerCase().includes(q));$('#content').innerHTML=`<div class="page-head"><div><h1>Reviews</h1><p>Moderate customer feedback displayed on TokaToka product pages.</p></div></div><div class="card"><div class="card-pad"><div class="toolbar"><div class="search"><span>⌕</span><input id="review-search" placeholder="Search review, product, or customer" value="${esc(state.filters.reviews)}"></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th>Product</th><th>Rating</th><th>Comment</th><th>Visibility</th><th>Date</th><th></th></tr></thead><tbody>${filtered.length?filtered.map(r=>`<tr><td><b>${esc(r.profiles?.full_name||'Customer')}</b></td><td>${esc(r.products?.name||'Deleted product')}</td><td><span class="rating">${'★'.repeat(Number(r.rating||0))}${'☆'.repeat(5-Number(r.rating||0))}</span></td><td style="max-width:320px">${esc(r.comment||'—')}</td><td>${badge(r.is_visible?'visible':'hidden',r.is_visible?'active':'inactive')}</td><td>${shortDate(r.created_at)}</td><td><button class="secondary-btn small-btn" onclick="window.__toggleReview('${r.id}',${!r.is_visible})">${r.is_visible?'Hide':'Show'}</button></td></tr>`).join(''):`<tr><td colspan="7"><div class="empty">No reviews found.</div></td></tr>`}</tbody></table></div></div></div>`;$('#review-search').oninput=e=>{state.filters.reviews=e.target.value;renderReviews()}}
async function toggleReview(id,value){try{const {error}=await db.from('reviews').update({is_visible:value}).eq('id',id);if(error)throw error;toast(value?'Review is visible':'Review hidden');await renderReviews(true)}catch(e){toast(fmtError(e),true)}}

function renderSettings(){const role=state.profile.role;$('#content').innerHTML=`<div class="page-head"><div><h1>Settings</h1><p>Admin panel connection and account information.</p></div></div><div class="grid two-col"><section class="card"><div class="card-pad"><div class="card-title"><h3>Supabase connection</h3>${badge('connected','active')}</div><div class="detail-grid"><div class="detail-item"><span>Project URL</span><b style="word-break:break-all">${esc(SUPABASE_URL)}</b></div><div class="detail-item"><span>Access</span><b>Browser anon key + RLS</b></div></div><div style="height:14px"></div><div class="notice">Never place a Supabase service-role key in this admin website. This panel is designed to work with the public anon/publishable key and database RLS policies.</div></div></section><section class="card"><div class="card-pad"><div class="card-title"><h3>Signed-in account</h3></div><div class="detail-grid"><div class="detail-item"><span>Name</span><b>${esc(state.profile.full_name||'—')}</b></div><div class="detail-item"><span>Role</span><b>${badge(role,role)}</b></div><div class="detail-item"><span>Phone</span><b>${esc(state.profile.phone||'—')}</b></div><div class="detail-item"><span>Theme</span><b>${esc(state.profile.theme||'system')}</b></div></div></div></section></div><div class="card" style="margin-top:16px"><div class="card-pad"><div class="card-title"><h3>Database note</h3></div><p class="muted-small" style="line-height:1.7;margin:0">Run <b>admin-policies.sql</b> in the same Supabase project after the original <b>supabase/schema.sql</b>. The policies allow admin/staff accounts to read operational data and manage the catalog while customers retain their existing access.</p></div></div>`}

function openModal(title,body,footer=''){
  closeModal();
  const root=$('#modal-root');
  root.innerHTML=`<div class="modal-backdrop" data-modal-backdrop><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-close-modal>×</button></div><div class="modal-body">${body}</div><div class="modal-foot">${footer}</div></div></div>`;
  const statusSelect=root.querySelector('#modal-order-status');
  if(statusSelect?.value==='cancelled'){
    const statusLabel=statusSelect.closest('label');
    const lockedNotice=document.createElement('div');
    lockedNotice.className='notice';
    lockedNotice.textContent='This order is cancelled and can no longer be edited.';
    statusLabel.replaceWith(lockedNotice);
    root.querySelector('#save-order-status')?.remove();
  }
  root.querySelector('[data-close-modal]')?.addEventListener('click',closeModal);
  root.querySelector('[data-modal-backdrop]').addEventListener('click',e=>{if(e.target.dataset.modalBackdrop)closeModal()});
}
function closeModal(){$('#modal-root').innerHTML=''}
document.addEventListener('click',e=>{if(e.target.matches('[data-close-modal]'))closeModal()});
function exportCSV(rows,file,fields){const csv=[fields.join(','),...rows.map(r=>fields.map(k=>{let v=k.split('.').reduce((a,x)=>a?.[x],r);if(v==null)v='';v=String(v).replaceAll('"','""');return `"${v}"`}).join(','))].join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file;a.click();URL.revokeObjectURL(a.href)}
window.__nav=n=>navigate(n);window.__order=id=>orderDetail(id);window.__newProduct=()=>productForm();window.__editProduct=id=>productForm(state.data.products.find(p=>p.id===id));window.__deleteProduct=id=>deleteProduct(id);window.__newCategory=()=>categoryForm();window.__editCategory=id=>categoryForm(state.data.categories.find(c=>c.id===id));window.__deleteCategory=id=>deleteCategory(id);window.__toggleReview=(id,v)=>toggleReview(id,v);
init();
