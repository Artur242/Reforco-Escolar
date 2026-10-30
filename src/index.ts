const themeButtons = document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]');
const savedTheme = localStorage.getItem('theme');
const initialTheme = savedTheme === 'dark' ? 'dark' : 'light';

function setTheme(theme: 'light' | 'dark'): void {
	document.documentElement.dataset.theme = theme;
	localStorage.setItem('theme', theme);

	themeButtons.forEach((button) => {
		button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
	});
}

themeButtons.forEach((button) => {
	button.addEventListener('click', () => {
		const theme = button.dataset.themeChoice;

		if (theme === 'light' || theme === 'dark') {
			setTheme(theme);
		}
	});
});

setTheme(initialTheme);
