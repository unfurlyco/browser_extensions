//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//
//  Created by Timothy Welch on 3/9/25.
//

import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems[0] as! NSExtensionItem
        
        // Log the message for debugging
        if let message = item.userInfo?[SFExtensionMessageKey] {
            os_log(.default, "Received message from browser.runtime.sendNativeMessage: %@", message as! CVarArg)
        }

        // Create response
        let response = NSExtensionItem()
        response.userInfo = [ SFExtensionMessageKey: [ "Response": "Received message" ] ]
        
        // Complete the request
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

}
