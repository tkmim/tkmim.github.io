function switchTheme() {
  const currentStyle = currentTheme();
  const iconElement = document.getElementById('github-icon');

  if (currentStyle === 'light') {
    setTheme('dark');
    if (iconElement) {
      iconElement.setAttribute('class', 'octicon');
      iconElement.setAttribute('color', '#f0f6fc');
    }    
    document.getElementById("toggleThemabutton").setAttribute("d", "M12 10.999c1.437.438 2.562 1.564 2.999 3.001.44-1.437 1.565-2.562 3.001-3-1.436-.439-2.561-1.563-3.001-3-.437 1.436-1.562 2.561-2.999 2.999zm8.001.001c.958.293 1.707 1.042 2 2.001.291-.959 1.042-1.709 1.999-2.001-.957-.292-1.707-1.042-2-2-.293.958-1.042 1.708-1.999 2zm-1-9c-.437 1.437-1.563 2.562-2.998 3.001 1.438.44 2.561 1.564 3.001 3.002.437-1.438 1.563-2.563 2.996-3.002-1.433-.437-2.559-1.564-2.999-3.001zm-7.001 22c-6.617 0-12-5.383-12-12s5.383-12 12-12c1.894 0 3.63.497 5.37 1.179-2.948.504-9.37 3.266-9.37 10.821 0 7.454 5.917 10.208 9.37 10.821-1.5.846-3.476 1.179-5.37 1.179z")
    
  }
  else {
    setTheme('light');
    if (iconElement) {
      iconElement.removeAttribute('color');
      iconElement.removeAttribute('class');
    }
    document.getElementById("toggleThemabutton").setAttribute("d", "M4.069 13h-4.069v-2h4.069c-.041.328-.069.661-.069 1s.028.672.069 1zm1.618 3.897l-2.879 2.88 1.414 1.414 2.879-2.88c-.527-.411-1.001-.885-1.414-1.414zm1.416-11.209l-2.88-2.881-1.415 1.414 2.881 2.881c.411-.529.885-1.003 1.414-1.414zm11.208 1.414l2.881-2.881-1.414-1.414-2.881 2.881c.529.411 1.003.886 1.414 1.414zm-5.311-3.033v-4.069h-2v4.069c.328-.041.66-.069 1-.069.34 0 .672.028 1 .069zm3.898 14.243l2.88 2.88 1.415-1.414-2.881-2.88c-.411.528-.885 1.002-1.414 1.414zm3.033-7.312c.041.328.069.661.069 1s-.028.672-.069 1h4.069v-2h-4.069zm-8.931 8.931v4.069h2v-4.069c-.328.041-.66.069-1 .069-.34 0-.672-.028-1-.069zm7-7.931c0 3.314-2.686 6-6 6-3.315 0-6-2.686-6-6s2.685-6 6-6c3.314 0 6 2.686 6 6zm-2 0c0-2.19-1.818-3.963-4-3.994 2.533 1.816 2.61 6.119 0 7.988 2.182-.031 4-1.804 4-3.994z")
  }
}

function setTheme(style) {
  document.querySelectorAll('.isInitialToggle').forEach(elem => {
    elem.classList.remove('isInitialToggle');
  });
  document.documentElement.setAttribute('data-color-mode', style);
  localStorage.setItem('data-color-mode', style);

}

function currentTheme() {
  const localStyle = localStorage.getItem('data-color-mode');
  const systemStyle = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return localStyle || systemStyle;
}

(() => {
  setTheme(currentTheme());
})();
