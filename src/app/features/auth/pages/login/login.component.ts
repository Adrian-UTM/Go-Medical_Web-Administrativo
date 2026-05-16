// features/auth/pages/login/login.component.ts
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIf } from '@angular/common';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'bc-login',
  standalone: true,
  imports: [ReactiveFormsModule, NgIf, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  form: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  isLoading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');
  showPassword = signal(false);
  failedLoginAttempts = signal(0);

  get emailCtrl() { return this.form.get('email')!; }
  get passwordCtrl() { return this.form.get('password')!; }
  get showRecoverPassword(): boolean { return this.failedLoginAttempts() > 0; }

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.auth.signIn(this.form.value).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.failedLoginAttempts.set(0);
        this.router.navigate(['/dashboard']);
      },
      error: (err: Error) => {
        this.isLoading.set(false);
        this.failedLoginAttempts.update(value => value + 1);
        this.errorMessage.set(err.message ?? 'Error al iniciar sesión. Intente nuevamente.');
      }
    });
  }

  onRecoverPassword(): void {
    this.emailCtrl.markAsTouched();

    if (this.emailCtrl.invalid) {
      this.errorMessage.set('Ingresa un correo valido para recuperar tu contraseña.');
      this.successMessage.set('');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.auth.recoverPassword(this.emailCtrl.value).subscribe({
      next: (message) => {
        this.isLoading.set(false);
        this.successMessage.set(message);
      },
      error: (err: Error) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.message ?? 'No fue posible recuperar la contraseña.');
      }
    });
  }
}
