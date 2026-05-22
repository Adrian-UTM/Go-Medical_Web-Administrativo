import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Observable, fromEvent } from 'rxjs';
import { filter, mapTo, share, throttleTime } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class PageVisibilityService {
  private static readonly MIN_HIDDEN_MS_BEFORE_REFRESH = 30000;

  private readonly document = inject(DOCUMENT);
  private hiddenAt = 0;

  readonly visible$: Observable<void> = fromEvent(this.document, 'visibilitychange').pipe(
    filter(() => this.shouldRefreshAfterVisibilityChange()),
    throttleTime(30000, undefined, { leading: true, trailing: false }),
    mapTo(void 0),
    share()
  );

  private shouldRefreshAfterVisibilityChange(): boolean {
    if (this.document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now();
      return false;
    }

    if (this.document.visibilityState !== 'visible') {
      return false;
    }

    const hiddenDuration = this.hiddenAt ? Date.now() - this.hiddenAt : 0;
    this.hiddenAt = 0;
    return hiddenDuration >= PageVisibilityService.MIN_HIDDEN_MS_BEFORE_REFRESH;
  }
}
