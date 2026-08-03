const fs = require('fs');
let content = fs.readFileSync('src/components/top-nav/top-nav.component.ts', 'utf8');

content = content.replace(
  `  @HostListener('document:click', ['$event'])
  closeDropdowns(event: Event) {
    this.openDropdown.set(null);
    const target = event.target as HTMLElement;
    if (!target.closest('.search-container')) {
      this.closeSearch();
    }
  }`,
  `  @HostListener('document:click', ['$event'])
  closeDropdowns(event?: Event) {
    this.openDropdown.set(null);
    if (event) {
      const target = event.target as HTMLElement;
      if (!target.closest('.search-container')) {
        this.closeSearch();
      }
    } else {
      this.closeSearch();
    }
  }`
);

fs.writeFileSync('src/components/top-nav/top-nav.component.ts', content);
