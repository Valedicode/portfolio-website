// Get the button
let scrollToTopBtn = document.getElementById("scrollToTopBtn");

// When the user clicks on the button, scroll smoothly to the top
scrollToTopBtn.addEventListener("click", function() {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
});

// Optional: Show/hide the button when scrolling
window.onscroll = function() {
  if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
    scrollToTopBtn.style.display = "block";
  } else {
    scrollToTopBtn.style.display = "none";
  }
};