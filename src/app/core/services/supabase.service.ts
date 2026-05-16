import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase/supabase.client';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  constructor() {}

  get client(): SupabaseClient {
    return supabase;
  }
}
