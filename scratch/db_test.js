const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hdxrlmknrkkagsfzncnb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkeHJsbWtucmtrYWdzZnpuY25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NzAwMDYsImV4cCI6MjA5MzU0NjAwNn0.gzeSznxzye68BbwOFtzuLHm-fMpEIf-50YRQwA2JATA';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log('Testing connection to Supabase...');
  
  // 1. Check carts table
  const { data: carts, error: cartsErr } = await supabase.from('carts').select('*').limit(5);
  if (cartsErr) {
    console.error('Error fetching carts:', cartsErr);
  } else {
    console.log('Carts (count):', carts.length);
    console.log('Sample cart:', carts[0]);
  }

  // 2. Check cart_items table
  const { data: items, error: itemsErr } = await supabase.from('cart_items').select('*').limit(5);
  if (itemsErr) {
    console.error('Error fetching cart_items:', itemsErr);
  } else {
    console.log('Cart Items (count):', items.length);
    console.log('Sample item:', items[0]);
  }

  // 3. Check abandoned_cart_opportunities
  const { data: opps, error: oppsErr } = await supabase.from('abandoned_cart_opportunities').select('*').limit(5);
  if (oppsErr) {
    console.error('Error fetching abandoned_cart_opportunities:', oppsErr);
  } else {
    console.log('Abandoned Cart Opps (count):', opps.length);
    console.log('Sample Opp:', opps[0]);
  }

  // 4. Check profiles table
  const { data: profiles, error: profErr } = await supabase.from('profiles').select('*').limit(5);
  if (profErr) {
    console.error('Error fetching profiles:', profErr);
  } else {
    console.log('Profiles (count):', profiles.length);
    console.log('Sample profile:', profiles[0]);
  }

  // 5. Check clients table
  const { data: clients, error: clientsErr } = await supabase.from('clients').select('*').limit(5);
  if (clientsErr) {
    console.error('Error fetching clients:', clientsErr);
  } else {
    console.log('Clients (count):', clients.length);
    console.log('Sample client:', clients[0]);
  }
}

test();
