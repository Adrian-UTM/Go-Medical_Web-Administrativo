// core/guards/auth.guard.ts
// Protege rutas que requieren sesión activa

import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async (_route, _state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ensureSessionReady();

  if (auth.isAuthenticated) {
    return true;
  }

  try {
    const session = await auth.getSession();
    if (session) {
      await auth.refreshSessionState();
      if (auth.isAuthenticated) {
        return true;
      }
    }
  } catch {
    // Si la sesión no puede recuperarse, la salida controlada se resuelve con la redirección.
  }

  return router.createUrlTree(['/login']);
};
