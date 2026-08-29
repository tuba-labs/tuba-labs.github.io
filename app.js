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

document.addEventListener("DOMContentLoaded", () => {
    const asciiBlocks = Array.from(document.querySelectorAll("pre.ascii"));
    if (!asciiBlocks.length) return;

    const getHorizontalSpacing = (element) => {
        const style = window.getComputedStyle(element);
        return (
            parseFloat(style.paddingLeft) +
            parseFloat(style.paddingRight) +
            parseFloat(style.borderLeftWidth) +
            parseFloat(style.borderRightWidth)
        );
    };

    const getAvailableWidth = (element) => {
        const container = element.parentElement;
        if (!container) return 0;

        const containerStyle = window.getComputedStyle(container);
        return (
            container.clientWidth -
            parseFloat(containerStyle.paddingLeft) -
            parseFloat(containerStyle.paddingRight)
        );
    };

    const fitAsciiBlocks = () => {
        asciiBlocks.forEach((block) => {
            if (!block.dataset.baseFontSizePx) {
                block.dataset.baseFontSizePx = String(parseFloat(window.getComputedStyle(block).fontSize));
            }

            const baseFontSize = parseFloat(block.dataset.baseFontSizePx);
            if (!Number.isFinite(baseFontSize) || baseFontSize <= 0) return;

            block.style.fontSize = `${baseFontSize}px`;

            const availableWidth = getAvailableWidth(block);
            if (availableWidth <= 0) return;

            const horizontalSpacing = getHorizontalSpacing(block);
            const textWidth = block.scrollWidth - horizontalSpacing;
            const availableTextWidth = availableWidth - horizontalSpacing;

            if (availableTextWidth <= 0) return;
            if (textWidth <= availableTextWidth) return;

            const scale = availableTextWidth / textWidth;
            block.style.fontSize = `${baseFontSize * scale}px`;
        });
    };

    let frameRequested = false;
    const scheduleFit = () => {
        if (frameRequested) return;

        frameRequested = true;
        window.requestAnimationFrame(() => {
            frameRequested = false;
            fitAsciiBlocks();
        });
    };

    scheduleFit();
    window.addEventListener("resize", scheduleFit);
});
