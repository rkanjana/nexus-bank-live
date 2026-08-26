document.addEventListener("DOMContentLoaded", function () {
    const serviceSection = document.querySelector(".services");

    function revealOnScroll() {
        let sectionTop = serviceSection.getBoundingClientRect().top;
        let windowHeight = window.innerHeight;

        if (sectionTop < windowHeight - 100) {
            serviceSection.style.opacity = "1";
            serviceSection.style.transform = "translateY(0)";
        }
    }

    window.addEventListener("scroll", revealOnScroll);
});
// Wait for 2 seconds, then fade out welcome screen and show main content
setTimeout(function() {
    document.getElementById("welcomeScreen").style.opacity = "0"; // Fade out effect
    setTimeout(function() {
        document.getElementById("welcomeScreen").style.display = "none";
        document.getElementById("mainContent").style.display = "block";
    }, 1000); // Wait for fade-out to complete
}, 2000);