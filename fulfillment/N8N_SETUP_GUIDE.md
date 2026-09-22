# SafePet Strap - Smart n8n Dropshipping Automation Guide

This guide explains how your smart n8n automation eliminates the AliExpress 2-hour payment expiration issue, provides on-demand order selection from Shopify Admin, and automates logistics tracking.

---

## 1. Why This Is the Smartest Architecture

| The Problem | How This n8n Workflow Solves It |
| :--- | :--- |
| **2-Hour AliExpress Expiration** | Instead of randomly pushing orders while you are away from your desk, n8n only triggers when **you** explicitly select orders in Shopify Admin (via tag `fulfill-ali`) or approve a scheduled check. |
| **Instant 1-Click Pay Alert** | The second orders are created on AliExpress, n8n generates the direct link to [AliExpress Awaiting Payment](https://www.aliexpress.com/orderList.htm) and sends an immediate alert to your Telegram/WhatsApp/Email so you can pay in 1 click within minutes. |
| **Multi-Item & Personalization** | Parses harnesses (S/M/L/XL), seat belt bundles, GPS trackers, and custom engraved Dog ID Tags (`Dog's Name: Molly • Phone: 6362603857`), while filtering out digital eBooks and warranties. |
| **Automatic Tracking Sync** | Runs every 4 hours, queries AliExpress for tracking numbers, and marks the orders as **Fulfilled** in Shopify, triggering customer shipping emails automatically. |

---

## 2. Quick 1-Minute Import into n8n

1. Open your **n8n Web Interface** on your Linux server.
2. In the top right menu, click **Add Workflow** $\rightarrow$ **Import from File...** (or press `Ctrl+V` / `Cmd+V`).
3. Select the file:
   [`fulfillment/safepet_n8n_master_workflow.json`](file:///Users/imacm1/Desktop/SafePetStrap/fulfillment/safepet_n8n_master_workflow.json)
4. Click **Save** and **Activate** (toggle Active switch to ON).

Your webhook is now live at:
`https://your-n8n-domain.com/webhook/safepet-fulfill`

---

## 3. Configure Shopify Flow in 2 Minutes

Shopify Flow is the free official automation app by Shopify:

1. In **Shopify Admin**, go to **Apps $\rightarrow$ Shopify Flow**.
2. Click **Create workflow**.
3. **Trigger**:
   - Choose: **Order tags added**
4. **Condition (Criteria)**:
   - Click `+` $\rightarrow$ Condition $\rightarrow$ **Order tags** includes **`fulfill-ali`**
5. **Action**:
   - Click `+` $\rightarrow$ Action $\rightarrow$ **Send HTTP request**
   - **URL**: `https://your-n8n-domain.com/webhook/safepet-fulfill` (or your server webhook URL)
   - **Method**: `POST`
   - **Headers**: `Content-Type: application/json`
   - **Body**:
     ```json
     {
       "order_id": "{{order.id}}",
       "order_number": "{{order.name}}",
       "tag": "fulfill-ali"
     }
     ```
6. Click **Turn on workflow**.

---

## 4. How to Use It Daily (Effortless 3-Step Process)

1. **Select in Shopify**:
   Open **Shopify Admin $\rightarrow$ Orders**, select any orders you are ready to fulfill, click **More actions $\rightarrow$ Add tags $\rightarrow$ `fulfill-ali`**.
2. **Instant Automation**:
   Shopify Flow pings n8n $\rightarrow$ n8n creates the orders on AliExpress $\rightarrow$ removes `fulfill-ali` $\rightarrow$ tags order `ali-placed, ali-id:<order_id>`.
3. **1-Click Payment**:
   You receive the alert with the direct link. Click it, check **"Select All"**, and click **"Pay for All Orders"**!
