// layouts/admin-layout/admin-layout.component.ts
import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { TopbarComponent } from './components/topbar/topbar.component';

@Component({
  selector: 'bc-admin-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  template: `
    <div class="admin-shell" [class.admin-shell--collapsed]="sidebarCollapsed()">
      <bc-sidebar
        [collapsed]="sidebarCollapsed()"
        (toggleCollapse)="toggleSidebar()"
      ></bc-sidebar>

      <div class="admin-shell__main">
        <bc-topbar
          [sidebarCollapsed]="sidebarCollapsed()"
          (menuToggle)="toggleSidebar()"
        ></bc-topbar>

        <main class="admin-shell__content" id="main-content">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styleUrl: './admin-layout.component.css'
})
export class AdminLayoutComponent {
  sidebarCollapsed = signal(false);

  toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }
}
