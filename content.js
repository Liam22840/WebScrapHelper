// Listen for a request from the background script to get page content
if (!window._ollamaScraperListenerRegistered) {
  window._ollamaScraperListenerRegistered = true;

  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPageContent") {
      // Simple extraction: get visible text. 
      // For better results, one might use a library to remove navbars/footers.
      const content = document.body.innerText || document.body.textContent;
      
      // Clean up excessive whitespace to save context window tokens
      const cleanedContent = content.replace(/\s+/g, ' ').trim();
      
      // Limit content length to prevent context overflow (approx 15k chars)
      // Adjust based on the model you use (e.g., llama3 has 8k context)
      const truncatedContent = cleanedContent.substring(0, 20000);

      sendResponse({ content: truncatedContent });
    }
  });
}
