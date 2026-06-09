In our app, we have 2 files for the editor. One is app.templates*.$id.jsx- which we use to load the saved template. We have another file app.templates*.new.jsx- which we use to load the new template. But in the shopify app tutorial, I have seen them doing some smart coding. I have copied that code into dynamic-routes.jsx file.

When they load the data, they check the params.id. If it is new, they load the new template. If it is not new, they load the saved template.

Can we do something similar with our app? Think about our future app flow. If it does not create problem, lets make a single route for the editor. If there is any potential issue, inform me.
