import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ensureSessionReady();

  if (auth.isAuthenticated) {
    const isValid = await auth.validateAdminAccessAsync();
    if (isValid) {
      return true;
    }
    
    await auth.signOut();
  }

  return router.createUrlTree(['/login']);
};
