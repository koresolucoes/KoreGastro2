const fs = require('fs');
let content = fs.readFileSync('src/components/top-nav/top-nav.component.ts', 'utf8');

content = content.replace(
  `import { Component, ChangeDetectionStrategy, inject, signal, computed, HostListener } from '@angular/core';`,
  `import { Component, ChangeDetectionStrategy, inject, signal, computed, HostListener, ViewChild, ElementRef } from '@angular/core';`
);

content = content.replace(
  `  isSearchOpen = signal(false);`,
  `  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;\n  isSearchOpen = signal(false);`
);

content = content.replace(
  `  openSearch(event: KeyboardEvent) {
    event.preventDefault();
    this.isSearchOpen.set(true);
    // Focus search input logic would go here
  }`,
  `  openSearch(event: KeyboardEvent) {
    event.preventDefault();
    this.isSearchOpen.set(true);
    setTimeout(() => {
      if (this.searchInput) {
        this.searchInput.nativeElement.focus();
      }
    });
  }`
);

fs.writeFileSync('src/components/top-nav/top-nav.component.ts', content);
