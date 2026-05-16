import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase.service';

@Injectable({
  providedIn: 'root'
})
export class ProductSupabaseService {
  constructor(private supabase: SupabaseService) {}

  getProducts(): Observable<any[]> {
    return from(
      this.supabase.client
        .from('products')
        .select('*')
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          throw new Error(error.message);
        }
        return data || [];
      })
    );
  }
}
