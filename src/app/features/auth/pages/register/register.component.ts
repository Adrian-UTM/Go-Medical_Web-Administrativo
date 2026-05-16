// features/auth/pages/register/register.component.ts
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIf } from '@angular/common';
import { AuthService, RegisterCredentials } from '../../../../core/services/auth.service';

@Component({
  selector: 'bc-register',
  standalone: true,
  imports: [ReactiveFormsModule, NgIf, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css' // Reutilizaremos los estilos del login
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  form: FormGroup = this.fb.group({
    full_name: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  isLoading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');
  showPassword = signal(false);

  get fullNameCtrl() { return this.form.get('full_name')!; }
  get emailCtrl() { return this.form.get('email')!; }
  get passwordCtrl() { return this.form.get('password')!; }

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

    const credentials: RegisterCredentials = this.form.value;

    this.auth.register(credentials).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.successMessage.set('Registro exitoso. Tu cuenta está pendiente de aprobación por un administrador.');
        this.form.reset();
      },
      error: (err: Error) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.message ?? 'Error al registrarse. Intente nuevamente.');
      }
    });
  }
}
