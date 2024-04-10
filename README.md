![[collab-vm-web-app] - Node.js Parcel](https://github.com/Elijahr2411/collab-vm-web-app/workflows/%5Bcollab-vm-web-app%5D%20-%20Node.js%20Gulp/badge.svg)

# CollabVM Classic Webapp
The Collab VM Web App powers the website-portion of Collab VM and the Virus Farm.

# What it contains
* The scripts that power CollabVM.

# Compilation requirements
To compile this, all you need is an OS that supports node.js.

# Compilation instructions

To build the web app, follow these steps.

* Step 1: Install node.js and npm. Windows and Mac OS X installers can be found here: https://nodejs.org/en/download/. For Linux, BSD, and other operating systems, visit this page: https://nodejs.org/en/download/package-manager/.
* Step 2: Install the dependencies by running `npm install`
* Step 3: Open src/js/collab-vm/common.js and put the VM URLs you want this webapp to point to in additionalNodes and additionalNodesSecure. You can also set `DEBUG` to `true` if you're testing the webapp.
* Step 4: Build the webapp by running `npm run build`

# License
Collab VM Web App, as well as Collab VM Admin Web App and Collab VM Server are licensed under the [Apache License](https://www.apache.org/licenses/LICENSE-2.0).
