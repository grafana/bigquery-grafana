# Install bigquery-grafana

There are multiple ways to install bigquery-grafana datasource plugin, please **choose one** below:

## From grafana.net

Install from [grafana.net](https://grafana.net/plugins/grafana-bigquery-datasource)

## Grafana-cli

Use the [grafana-cli](http://docs.grafana.org/plugins/installation/#installing-plugins-manually)

```bash
grafana-cli --pluginUrl https://github.com/doitintl/bigquery-grafana/archive/2.0.2.zip plugins install grafana-bigquery-datasource
```

## Copy files

Copy files to your [Grafana plugin directory](http://docs.grafana.org/plugins/installation/#grafana-plugin-directory). Restart Grafana, check datasources list at http://your.grafana.instance/datasources/new, and choose BigQuery option.

## Helm Chart

Add the below to your values.yaml

```
...
## Pass the plugins you want installed as a list.
##
plugins:
  - https://github.com/doitintl/bigquery-grafana/archive/2.0.2.zip;doit-bigquery-datasource

grafana.ini:
  plugins:
    allow_loading_unsigned_plugins: grafana-bigquery-datasource
...
```

for more details please see [grafana helm chart](https://github.com/helm/charts/tree/master/stable/grafana)
