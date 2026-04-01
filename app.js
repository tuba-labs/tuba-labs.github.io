document.addEventListener("DOMContentLoaded", () => {
    // Rule 1: must be inside iframe
    if (window === window.top) return;

    // Get filename
    const path = window.location.pathname;
    const fileName = path.split('/').pop();

    if (!fileName) return;

    // Rule 2: only show for capitalized filenames
    const startsWithCapital = /^[A-Z]/.test(fileName);

    if (!startsWithCapital) return;

    // Inject back link
    const backLink = document.createElement("a");
    backLink.textContent = "← Back";
    backLink.href = "#";
    backLink.className = "backLink";

    backLink.onclick = () => {
        history.back();
        return false;
    };

    document.body.insertBefore(backLink, document.body.firstChild);
});