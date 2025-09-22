// Circular Controls Functionality

document.addEventListener('DOMContentLoaded', () => {
    initializeCircularControls();
});

function initializeCircularControls() {
    const controlCircles = document.querySelectorAll('.control-circle');
    
    // Add click event listeners to each control circle
    controlCircles.forEach(circle => {
        circle.addEventListener('click', function(e) {
            // If clicking on the content area, don't toggle
            if (e.target.closest('.control-content') && !e.target.closest('.control-icon, .control-label')) {
                e.stopPropagation();
                return;
            }
            
            // Toggle active state on the clicked circle
            const wasActive = this.classList.contains('active');
            
            // First, close all open controls
            controlCircles.forEach(c => c.classList.remove('active'));
            
            // Then, if the clicked one wasn't active before, make it active
            if (!wasActive) {
                this.classList.add('active');
            }
        });
    });
    
    // Close controls when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.control-circle')) {
            controlCircles.forEach(circle => circle.classList.remove('active'));
        }
    });
    
    // Prevent clicks inside content from closing
    document.querySelectorAll('.control-content').forEach(content => {
        content.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });
}

// Export the initialization function
export { initializeCircularControls };
