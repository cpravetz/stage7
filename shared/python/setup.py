from setuptools import setup, find_packages

setup(
    name='ckt_plan_validator',
    version='0.1.0',
    packages=find_packages(where='lib'),
    package_dir={'': 'lib'},
)
