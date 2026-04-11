class ThemeController {
  static init() {
    const themeButtons = document.querySelectorAll('.theme-btn');
    themeButtons.forEach(button => {
      button.addEventListener('click', () => {
        const theme = button.dataset.theme;
        this.setTheme(theme);
      });
    });
  }

  static setTheme(theme) {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-color-scheme');
      localStorage.removeItem('theme');
    } else {
      root.setAttribute('data-color-scheme', theme);
      localStorage.setItem('theme', theme);
    }
    this.updateActiveButton(theme);
  }

  static applySavedTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    this.setTheme(savedTheme);
  }

  static updateActiveButton(activeTheme) {
    document.querySelectorAll('.theme-btn').forEach(button => {
      if (button.dataset.theme === activeTheme) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
  }
}
