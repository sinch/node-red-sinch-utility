# @sinch/node-red-sinch-utility

A package containing an enhanced HTTP In node for [Node-RED](https://nodered.org), compatible with the other Node-RED's http nodes. This node enables to configure the inbound url to be dynamicly set based on a subflow environment variable or a global/flow context variable.

# Example urls
1. Environment variable passed from subflow: <code>/{{env.some-variable}}</code>
2. Variable from global context: <code>/{{global.some-variable}}</code>
3. Variable from flow context: <code>/{{flow.some-variable}}</code>

## Installation

The first step is to install [Node-RED](https://nodered.org/docs/getting-started/local).

```
$ sudo npm install -g node-red
```

> Compatible with Node-Red version 3.x.x and later

The second step is to install the package. You can either install it directly using the Palette Manager. Instructions can be found here: [Node-RED](https://nodered.org/docs/user-guide/runtime/adding-nodes).

Or install manually using npm:

Navigate to the Node-RED installation and install the package:

```
$ cd ~/.node-red
$ npm install @sinch/node-red-sinch-utility
```

Run Node-RED locally: 
```
$ node-red
```

This will start a server for Node-RED on [http://127.0.0.1:1880/](http://127.0.0.1:1880/).

If the installation of the node package was successful, the Sinch Utility nodes should be available in the node palette to the left, under the category "Sinch Utility". 

# Example flow

[Flow link](docs/examples/flow.json)

## Copyright and license

Copyright Sinch AB, https://sinch.com under the [Apache 2.0 license](LICENSE).